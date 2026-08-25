import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { stripVTControlCharacters } from 'node:util';

import { input } from '#src/prompts/input';
import { select } from '#src/prompts/select';
import { ANSI } from '#src/utils/terminal';

interface PromptProcessResult {
  exitCode: number;
  output: string;
  rawOutput: string;
  result: string;
}

interface TerminalSize {
  cols?: number;
  rows?: number;
}

// 显式固定颜色状态，避免开发者本机和不同 CI 环境影响原始字节快照。
function getTerminalEnv(color: boolean): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {
    ...process.env,
    TERM: 'xterm-256color',
  };

  delete env['NODE_DISABLE_COLORS'];

  if (color) {
    env['FORCE_COLOR'] = '1';
    delete env['NO_COLOR'];
  } else {
    env['NO_COLOR'] = '1';
    delete env['FORCE_COLOR'];
  }

  return env;
}

async function runPromptInTerminal(
  fixture: string,
  color: boolean,
  interact: (terminal: Bun.Terminal, output: string) => void,
  terminalSize: TerminalSize = {},
): Promise<PromptProcessResult> {
  const decoder = new TextDecoder();
  let output = '';
  const { promise: terminalExited, resolve: resolveTerminalExit } =
    Promise.withResolvers<void>();
  const subprocess = Bun.spawn({
    cmd: [process.execPath, join(import.meta.dir, 'fixtures', fixture)],
    cwd: join(import.meta.dir, '..'),
    env: getTerminalEnv(color),
    terminal: {
      ...terminalSize,
      data(terminal, data) {
        output += decoder.decode(data, { stream: true });
        interact(terminal, output);
      },
      exit() {
        resolveTerminalExit();
      },
    },
  });
  const [exitCode] = await Promise.all([subprocess.exited, terminalExited]);

  // TextDecoder 的流式模式可能保留尾部字节，结束后必须主动刷新。
  output += decoder.decode();

  return {
    exitCode,
    output: stripVTControlCharacters(output).replaceAll('\r\n', '\n'),
    rawOutput: output,
    result: output.match(/RESULT=([^\r\n]+)/)?.[1] ?? '',
  };
}

async function runSelectInTerminal(
  inputBytes: readonly number[],
  color = false,
  fixture = 'select.ts',
  terminalSize?: TerminalSize,
): Promise<PromptProcessResult> {
  let inputSent = false;

  return runPromptInTerminal(
    fixture,
    color,
    (terminal, output) => {
      // 等待首屏完整渲染后再发送按键，避免测试与终端初始化竞争。
      if (!inputSent && output.includes(ANSI.ERASE_DOWN)) {
        inputSent = true;
        terminal.write(Uint8Array.from(inputBytes));
      }
    },
    terminalSize,
  );
}

async function runPromptFromPipe(
  inputBytes: Iterable<number> = [],
  fixture = 'select.ts',
): Promise<PromptProcessResult> {
  const subprocess = Bun.spawn({
    cmd: [process.execPath, join(import.meta.dir, 'fixtures', fixture)],
    cwd: join(import.meta.dir, '..'),
    env: getTerminalEnv(false),
    stdin: new Blob([Uint8Array.from(inputBytes)]),
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    subprocess.exited,
    new Response(subprocess.stdout).text(),
    new Response(subprocess.stderr).text(),
  ]);

  return {
    exitCode,
    output: stripVTControlCharacters(stdout),
    rawOutput: stdout,
    result: stdout.match(/RESULT=([^\r\n]+)/)?.[1] ?? stderr.trim(),
  };
}

async function runSelectFailureFromPipe(): Promise<{
  cursorRestored: boolean;
  errorMessage: string;
  rawModes: boolean[];
}> {
  const subprocess = Bun.spawn({
    cmd: [process.execPath, join(import.meta.dir, 'fixtures/select-error.ts')],
    cwd: join(import.meta.dir, '..'),
    env: getTerminalEnv(true),
    stdin: new Blob([]),
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    subprocess.exited,
    new Response(subprocess.stdout).text(),
    new Response(subprocess.stderr).text(),
  ]);

  expect(exitCode).toBe(0);
  expect(stderr).toBe('');

  const result = stdout.match(/RESULT=([^\r\n]+)/)?.[1];

  if (!result) {
    throw new Error('Select failure fixture did not return a result.');
  }
  return JSON.parse(result);
}

async function runInputInTerminal(
  color: boolean,
): Promise<PromptProcessResult> {
  const decoder = new TextDecoder();
  let output = '';
  let inputSent = false;
  const { promise: terminalExited, resolve: resolveTerminalExit } =
    Promise.withResolvers<void>();
  const subprocess = Bun.spawn({
    cmd: [process.execPath, join(import.meta.dir, 'fixtures/input.ts')],
    cwd: join(import.meta.dir, '..'),
    env: getTerminalEnv(color),
    terminal: {
      data(terminal, data) {
        output += decoder.decode(data, { stream: true });

        if (!inputSent && output.includes('(rebake):')) {
          inputSent = true;
          terminal.write('audit\r');
        }
      },
      exit() {
        resolveTerminalExit();
      },
    },
  });
  const [exitCode] = await Promise.all([subprocess.exited, terminalExited]);

  output += decoder.decode();

  return {
    exitCode,
    output: stripVTControlCharacters(output).replaceAll('\r\n', '\n'),
    rawOutput: output,
    result: output.match(/RESULT=([^\r\n]+)/)?.[1] ?? '',
  };
}

describe('input prompt', () => {
  test('rejects invalid arguments before reading from the terminal', () => {
    const invalidMessage = JSON.parse('1');
    const invalidOptions = JSON.parse('null');
    const invalidDefault = JSON.parse('{"default":1}');

    expect(() => input(invalidMessage)).toThrow(
      'Input message must be a string.',
    );
    expect(() => input('', invalidOptions)).toThrow(
      'Input options must be an object.',
    );
    expect(() => input('', invalidDefault)).toThrow(
      'Input default value must be a string.',
    );
  });

  test('uses defaults only for submitted empty input', async () => {
    const empty = await runPromptFromPipe([10], 'input.ts');
    const endOfInput = await runPromptFromPipe([], 'input.ts');
    const incomplete = await runPromptFromPipe(
      new TextEncoder().encode('audit'),
      'input.ts',
    );

    expect(empty.result).toBe('rebake');
    expect(endOfInput.result).toBe('null');
    expect(incomplete.result).toBe('null');
  });

  test('preserves whitespace entered by the user', async () => {
    const result = await runPromptFromPipe(
      new TextEncoder().encode('  Rebake  \n'),
      'input.ts',
    );

    expect(result.result).toBe('  Rebake  ');
  });

  test('rejects input beyond the Bun prompt byte boundary', async () => {
    const accepted = await runPromptFromPipe(
      new TextEncoder().encode(`${'a'.repeat(1023)}\n`),
      'input.ts',
    );
    const rejected = await runPromptFromPipe(
      new TextEncoder().encode(`${'a'.repeat(1024)}\n`),
      'input.ts',
    );

    expect(accepted.exitCode).toBe(0);
    expect(accepted.result).toHaveLength(1023);
    expect(rejected.exitCode).toBe(1);
    expect(rejected.result).toContain('Input cannot exceed 1023 bytes.');
  });

  test('propagates input read errors without changing select behavior', async () => {
    const inputError = await runPromptFromPipe([], 'input-read-error.ts');
    const selection = await runPromptFromPipe([], 'select-read-error.ts');

    expect(inputError.exitCode).toBe(1);
    expect(inputError.result).toContain('syscall: "read"');
    expect(selection.exitCode).toBe(0);
    expect(selection.result).toBe('first');
  });

  test('preserves input boundaries between consecutive prompts', async () => {
    const afterInput = await runPromptFromPipe(
      new TextEncoder().encode('alice\n2'),
      'input-select.ts',
    );
    const afterSelect = await runPromptFromPipe(
      new TextEncoder().encode('2alice\n'),
      'select-input.ts',
    );

    expect(JSON.parse(afterInput.result)).toEqual({
      name: 'alice',
      choice: 'second',
    });
    expect(JSON.parse(afterSelect.result)).toEqual({
      choice: 'second',
      name: 'alice',
    });
  });

  if (process.platform !== 'win32') {
    // 快照保留 ANSI 和 CRLF，确保控制序列也与 Bun CLI 完全一致。
    test('matches Bun input output with and without color', async () => {
      const plain = await runInputInTerminal(false);
      const colored = await runInputInTerminal(true);

      expect(plain.rawOutput).toBe(
        'package name (rebake): audit\r\nRESULT=audit\r\n',
      );
      expect(colored.rawOutput).toBe(
        '\x1b[0m\x1b[36mpackage name\x1b[0m \x1b[2m(rebake):\x1b[0m audit\r\nRESULT=audit\r\n',
      );
    });
  }
});

describe('select prompt', () => {
  test('rejects invalid arguments before reading from the terminal', () => {
    const invalidMessage = JSON.parse('1');
    const invalidChoices = JSON.parse('{}');
    const invalidChoiceValues = [
      JSON.parse('null'),
      JSON.parse('{"value":1}'),
      JSON.parse('{"value":"one","label":1}'),
      JSON.parse('{"value":"one","disabled":"false"}'),
      JSON.parse('{"value":"one","selected":"false"}'),
    ];

    expect(() => select(invalidMessage, [])).toThrow(
      'Select message must be a string.',
    );
    expect(() => select('', invalidChoices)).toThrow(
      'Select choices must be an array.',
    );
    expect(() => select('Choose\nnow', [{ value: 'one' }])).toThrow(
      'Select message must be a single line.',
    );
    expect(() => select('Choose', [{ value: 'one\nline' }])).toThrow(
      'Select choice label at index 0 must be a single line.',
    );

    for (const choice of invalidChoiceValues) {
      expect(() => select('', [choice])).toThrow(TypeError);
    }
  });

  test('returns null without reading from the terminal when no choice is available', () => {
    expect(select('Choose', [])).toBeNull();
    expect(select('Choose', [{ value: 'vue', disabled: true }])).toBeNull();
  });

  test('restores raw mode and cursor when final rendering fails', async () => {
    const result = await runSelectFailureFromPipe();

    expect(result).toEqual({
      cursorRestored: true,
      errorMessage: 'simulated final render failure',
      rawModes: [true, false],
    });
  });

  test('ignores raw mode switching failures like Bun', async () => {
    const result = await runPromptFromPipe([], 'select-raw-mode-error.ts');

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.result)).toEqual({
      errorMessage: '',
      rawModes: [true, false, true, false],
      values: ['first', 'second'],
    });
  });

  test('honors selected choices and skips disabled choices', async () => {
    const selected = await runPromptFromPipe([], 'select-states.ts');
    const next = await runPromptFromPipe([106, 13], 'select-states.ts');
    const disabledShortcut = await runPromptFromPipe(
      [49, 13],
      'select-states.ts',
    );

    expect(selected.result).toBe('selected');
    expect(next.result).toBe('other');
    expect(disabledShortcut.result).toBe('selected');
  });

  if (process.platform !== 'win32') {
    test('selects with a POSIX arrow sequence and enter', async () => {
      const result = await runSelectInTerminal([27, 91, 66, 13]);

      expect(result.exitCode).toBe(0);
      expect(result.output).toContain(
        '? Select a project template - Press return to submit.\n',
      );
      expect(result.output).toContain('✓ Select a project template: React\n');
      expect(result.output).not.toContain('Cancelled');
      expect(result.result).toBe('react');
    });

    test('matches Bun cancellation output without color', async () => {
      const result = await runSelectInTerminal([3], false);

      expect(result.exitCode).toBe(0);
      expect(result.rawOutput).toBe(
        '? Select a project template - Press return to submit.\r\n' +
          '       Blank\x1b[0K\r\n' +
          '    React\x1b[0K\r\n' +
          '    Library\x1b[0K\r\n' +
          '\x1b[0J' +
          '\x1b[4A\x1b[0J' +
          '✓ Select a project template: Blank\r\n' +
          '\r\n' +
          'x Cancelled\r\n',
      );
      expect(result.result).toBe('');
    });

    test('matches Bun cancellation output with color', async () => {
      const result = await runSelectInTerminal([3], true);

      expect(result.exitCode).toBe(0);
      expect(result.rawOutput).toBe(
        '\x1b[0m\x1b[36m?\x1b[0m Select a project template\x1b[2m - Press return to submit.\x1b[0m\r\n' +
          '\x1b[?25l' +
          '\x1b[0m\x1b[36m❯\x1b[0m   \x1b[4m\x1b[33mBlank\x1b[0m\x1b[24m\x1b[0K\r\n' +
          '    \x1b[36mReact\x1b[0m\x1b[0K\r\n' +
          '    \x1b[34mLibrary\x1b[0m\x1b[0K\r\n' +
          '\x1b[0J' +
          '\x1b[4A\x1b[0J' +
          '\x1b[0m\x1b[32m✓\x1b[0m Select a project template\x1b[2m:\x1b[0m \x1b[33mBlank\x1b[0m\x1b[0m\r\n' +
          '\x1b[?25h' +
          '\r\n' +
          '\x1b[0m\x1b[31mx\x1b[0m Cancelled\r\n',
      );
      expect(result.result).toBe('');
    });

    test('supports vim navigation and Bun cancellation keys', async () => {
      const selected = await runSelectInTerminal([106, 13]);
      const cancelled = await runSelectInTerminal([27, 27]);
      const endOfTransmission = await runPromptFromPipe([4]);

      expect(selected.output).toContain('✓ Select a project template: React\n');
      expect(selected.result).toBe('react');
      expect(cancelled.output).toContain(
        '✓ Select a project template: Blank\n\nx Cancelled\n',
      );
      expect(cancelled.result).toBe('');
      expect(endOfTransmission.exitCode).toBe(0);
      expect(endOfTransmission.output).toContain('x Cancelled\n');
      expect(endOfTransmission.result).toBe('');
    });

    test('matches Bun unsupported and incomplete key handling', async () => {
      const uppercase = await runPromptFromPipe([74, 13]);
      const applicationCursor = await runPromptFromPipe([27, 79, 66]);
      const incompleteArrow = await runPromptFromPipe([27, 91]);

      expect(uppercase.result).toBe('blank');
      expect(applicationCursor.result).toBe('');
      expect(incompleteArrow.result).toBe('');
      expect(incompleteArrow.output).toContain(
        '✓ Select a project template: Blank\n\nx Cancelled\n',
      );
    });

    test('matches Bun numeric selection behavior', async () => {
      const result = await runSelectInTerminal([50]);

      expect(result.output).toContain(
        '✓ Select a project template: Blank\nRESULT=react\n',
      );
      expect(result.result).toBe('react');
    });

    test('redraws unchanged selection like Bun', async () => {
      const result = await runSelectInTerminal([122, 13]);

      expect(result.output.match(/ {7}Blank/g)).toHaveLength(2);
      expect(result.result).toBe('blank');
    });

    test('confirms the default choice on EOF like Bun', async () => {
      const result = await runPromptFromPipe();

      expect(result.exitCode).toBe(0);
      expect(result.output).toContain('✓ Select a project template: Blank\n');
      expect(result.result).toBe('blank');
    });

    test('keeps long choice lists inside the terminal viewport', async () => {
      const result = await runSelectInTerminal(
        [106, 106, 106, 13],
        false,
        'select-many.ts',
        { cols: 80, rows: 5 },
      );

      expect(result.exitCode).toBe(0);
      expect(result.result).toBe('4');
      expect(result.output).toContain('✓ Choose: Choice 4\n');
      expect(result.rawOutput).toContain(ANSI.CURSOR_UP(3));
      expect(result.rawOutput).toContain(ANSI.CURSOR_UP(4));
      expect(result.rawOutput).not.toContain(ANSI.CURSOR_UP(8));
      expect(result.rawOutput).not.toContain(ANSI.CURSOR_UP(9));
    });
  }
});
