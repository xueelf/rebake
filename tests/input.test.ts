import { expect, test } from 'bun:test';
import { stripVTControlCharacters } from 'node:util';

import { input } from '#src/prompts/input';
import { ANSI } from '#src/utils/terminal';

import { runPromptFromPipe, runPromptInTerminal } from './helpers/prompts';
import { renderTerminalScreen } from './helpers/screen';
import { getColorEnv } from './helpers/terminal';

// eslint-disable-next-line no-control-regex -- 等待错误区绘制后的相对光标回移，不能把清屏前的回移当作就绪。
const CORRECTED_INPUT_SUFFIX = /\r\x1b\[\d+A[^\x1b\r\n]+$/u;

async function runInputInTerminal(color: boolean) {
  let inputSent = false;

  return runPromptInTerminal('input.ts', {
    args: ['default'],
    env: getColorEnv(color ? { FORCE_COLOR: '1' } : { NO_COLOR: '1' }),
    onData: (terminal, output) => {
      if (
        !inputSent &&
        stripVTControlCharacters(output).endsWith('package name (rebake): ')
      ) {
        inputSent = true;
        terminal.write('audit\r');
      }
    },
  });
}

async function runValidatedInputInTerminal(color: boolean) {
  let invalidInputSent = false;
  let correctionSent = false;

  return runPromptInTerminal('input.ts', {
    args: ['validate'],
    env: getColorEnv(color ? { FORCE_COLOR: '1' } : { NO_COLOR: '1' }),
    onData: (terminal, output) => {
      // 等待提示及行尾清理写完，避免输入回显与首屏输出交错。
      if (!invalidInputSent && output.includes(ANSI.CLEAR_TO_END)) {
        invalidInputSent = true;
        terminal.write('rebake!\r');
      } else if (
        !correctionSent &&
        output.includes('Only lowercase letters are allowed.')
      ) {
        correctionSent = true;
        terminal.write('\x7f\r');
      }
    },
  });
}

test('配置项', () => {
  const invalidMessage = JSON.parse('1');
  const invalidOptions = JSON.parse('null');
  const invalidDefault = JSON.parse('{"default":1}');
  const invalidValidator = JSON.parse('{"validate":1}');

  expect(() => input(invalidMessage)).toThrow(
    'Input message must be a string.',
  );
  expect(() => input('', invalidOptions)).toThrow(
    'Input options must be an object.',
  );
  expect(() => input('', invalidDefault)).toThrow(
    'Input default value must be a string.',
  );
  expect(() => input('', invalidValidator)).toThrow(
    'Input validator must be a function.',
  );
});

test('管道校验', async () => {
  const valid = await runPromptFromPipe('input.ts', {
    args: ['validate'],
    input: 'rebake\n',
  });
  const defaulted = await runPromptFromPipe('input.ts', {
    args: ['validate'],
    input: '\n',
  });
  const invalid = await runPromptFromPipe('input.ts', {
    args: ['validate'],
    input: 'Rebake\n',
  });

  expect(valid.exitCode).toBe(0);
  expect(valid.result).toBe('rebake');
  expect(defaulted.exitCode).toBe(0);
  expect(defaulted.result).toBe('rebake');
  expect(invalid.exitCode).toBe(1);
  expect(invalid.result).toContain('Only lowercase letters are allowed.');
});

test('默认值', async () => {
  const empty = await runPromptFromPipe('input.ts', {
    args: ['default'],
    input: '\n',
  });
  const endOfInput = await runPromptFromPipe('input.ts', {
    args: ['default'],
    input: '',
  });
  const incomplete = await runPromptFromPipe('input.ts', {
    args: ['default'],
    input: 'audit',
  });

  expect(empty.result).toBe('rebake');
  expect(endOfInput.result).toBe('null');
  expect(incomplete.result).toBe('null');
});

test('首尾空白', async () => {
  const result = await runPromptFromPipe('input.ts', {
    args: ['default'],
    input: '  Rebake  \n',
  });

  expect(result.result).toBe('  Rebake  ');
});

test('输入长度', async () => {
  const accepted = await runPromptFromPipe('input.ts', {
    args: ['default'],
    input: `${'a'.repeat(1023)}\n`,
  });
  const rejected = await runPromptFromPipe('input.ts', {
    args: ['default'],
    input: `${'a'.repeat(1024)}\n`,
  });

  expect(accepted.exitCode).toBe(0);
  expect(accepted.result).toHaveLength(1023);
  expect(rejected.exitCode).toBe(1);
  expect(rejected.result).toContain('Input cannot exceed 1023 bytes.');
});

test('读取错误', async () => {
  const inputError = await runPromptFromPipe('input.ts', {
    args: ['read-error'],
    input: '',
  });
  expect(inputError.exitCode).toBe(1);
  expect(inputError.result).toContain('syscall: "read"');
});

test('连续交互（输入后选择）', async () => {
  const afterInput = await runPromptFromPipe('input.ts', {
    args: ['then-select'],
    input: 'alice\n2',
  });
  expect(JSON.parse(afterInput.result)).toEqual({
    name: 'alice',
    choice: 'second',
  });
});

// 快照保留 ANSI 和 CRLF，确保控制序列也与 Bun CLI 完全一致。
test.skipIf(process.platform === 'win32')('提示颜色', async () => {
  const plain = await runInputInTerminal(false);
  const colored = await runInputInTerminal(true);

  expect(plain.rawOutput).toBe(
    'package name (rebake): audit\r\nRESULT=audit\r\n',
  );
  expect(colored.rawOutput).toBe(
    '\x1b[0m\x1b[36mpackage name\x1b[0m \x1b[2m(rebake):\x1b[0m audit\r\nRESULT=audit\r\n',
  );
});

test.skipIf(process.platform === 'win32')('校验错误提示', async () => {
  const plain = await runValidatedInputInTerminal(false);
  const colored = await runValidatedInputInTerminal(true);

  expect(plain.exitCode).toBe(0);
  expect(plain.result).toBe('rebake');
  expect(
    renderTerminalScreen(plain.rawOutput, { cols: 80, rows: 24 })
      .join('\n')
      .match(/package name/g),
  ).toHaveLength(1);
  expect(plain.rawOutput).toBe(
    '\r\npackage name (rebake): ' +
      '\x1b[0K' +
      'rebake!\r\n' +
      '\r\x1b[1A\x1b[0Jpackage name (rebake): rebake!\r\n' +
      '> Only lowercase letters are allowed.\r\x1b[1Apackage name (rebake): rebake!' +
      '\r\x1b[0Jpackage name (rebake): rebake\r\n' +
      'RAW=false\r\n' +
      'RESULT=rebake\r\n',
  );

  expect(colored.exitCode).toBe(0);
  expect(colored.result).toBe('rebake');
  expect(
    renderTerminalScreen(colored.rawOutput, { cols: 80, rows: 24 })
      .join('\n')
      .match(/package name/g),
  ).toHaveLength(1);
  expect(colored.output).toBe(plain.output);
  expect(colored.rawOutput).toContain(
    '\x1b[0m\x1b[31m> Only lowercase letters are allowed.\x1b[0m',
  );
});

test.skipIf(process.platform === 'win32')('交互起始行', async () => {
  let inputSent = false;
  let correctionSent = false;
  const result = await runPromptInTerminal('input.ts', {
    args: ['inline'],
    cols: 80,
    rows: 6,
    onData: (terminal, output) => {
      if (!inputSent && output.endsWith(ANSI.CLEAR_TO_END)) {
        inputSent = true;
        terminal.write('BAD\r');
      } else if (!correctionSent && CORRECTED_INPUT_SUFFIX.test(output)) {
        correctionSent = true;
        terminal.write('\x7f\x7f\x7fok\r');
      }
    },
  });

  expect(result.exitCode).toBe(0);
  expect(result.result).toBe('ok');
  expect(result.rawOutput).toStartWith('prefix \r\nname: \x1b[0K');
  expect(
    renderTerminalScreen(result.rawOutput, { cols: 80, rows: 6 }).filter(
      line => line !== '',
    ),
  ).toEqual(['prefix', 'name: ok', 'RESULT=ok']);
});

test.skipIf(process.platform === 'win32').each([
  ['终端底部', { value: 'BAD', cols: 80, rows: 6 }],
  ['折行', { value: `BAD${'x'.repeat(36)}`, cols: 12, rows: 5 }],
  ['屏幕裁剪', { value: `BAD${'x'.repeat(100)}`, cols: 12, rows: 5 }],
  ['全角字符', { value: '坏'.repeat(20), cols: 12, rows: 5 }],
] as const)('校验重绘（%s）', async (_label, { value, cols, rows }) => {
  let step = 0;
  const screens: string[][] = [];
  const result = await runPromptInTerminal('input.ts', {
    args: ['screen'],
    cols,
    rows,
    onData: (terminal, output) => {
      if (step === 0 && output.endsWith(ANSI.CLEAR_TO_END)) {
        step = 1;
        terminal.write(`${value}\r`);
      } else if (
        (step === 1 || step === 2) &&
        CORRECTED_INPUT_SUFFIX.test(output)
      ) {
        screens.push(renderTerminalScreen(output, { cols, rows }));
        step += 1;
        terminal.write(
          step === 2 ? '\r' : `${'\x7f'.repeat(Array.from(value).length)}ok`,
        );
      } else if (step === 3 && output.endsWith('ok')) {
        screens.push(renderTerminalScreen(output, { cols, rows }));
        step = 4;
        terminal.write('\r');
      }
    },
  });

  expect(result.exitCode).toBe(0);
  expect(result.result).toBe('ok');
  expect(result.output).toContain('RAW=false');
  expect(screens).toHaveLength(3);
  expect(screens[0]?.at(-1)).toBe('> Enter ok.');
  expect(screens[1]).toEqual(screens[0]);
  expect(screens[2]?.filter(line => line !== '')).toEqual(['name: ok']);
  expect(
    renderTerminalScreen(result.rawOutput, { cols, rows }).filter(
      line => line !== '',
    ),
  ).toEqual(['name: ok', 'RAW=false', 'RESULT=ok']);
});

test.skipIf(process.platform === 'win32')('长文本显示', async () => {
  const value = '中'.repeat(300);
  let inputSent = false;
  let correctionSent = false;
  let invalidScreen: string[] = [];
  const result = await runPromptInTerminal('input.ts', {
    args: ['long'],
    cols: 12,
    rows: 5,
    onData: (terminal, output) => {
      if (!inputSent && output.endsWith(ANSI.CLEAR_TO_END)) {
        inputSent = true;
        terminal.write(`${value}!\r`);
      } else if (!correctionSent && CORRECTED_INPUT_SUFFIX.test(output)) {
        invalidScreen = renderTerminalScreen(output, { cols: 12, rows: 5 });
        correctionSent = true;
        terminal.write('\x7f\r');
      }
    },
  });

  expect(result.exitCode).toBe(0);
  expect(result.result).toBe(value);
  expect(result.output).toContain('RAW=false');
  expect(invalidScreen.slice(-3)).toEqual([
    '> Enter a va',
    'lue without',
    '!.',
  ]);
  expect(invalidScreen.join('\n')).not.toContain('name:');
});

test.skipIf(process.platform === 'win32')('长文本提交', async () => {
  const value = 'a'.repeat(1023);
  let inputSent = false;
  const result = await runPromptInTerminal('input.ts', {
    args: ['validate'],
    onData: (terminal, output) => {
      if (!inputSent && output.includes(ANSI.CLEAR_TO_END)) {
        inputSent = true;
        terminal.write(`${value}\r`);
      }
    },
  });

  expect(result.exitCode).toBe(0);
  expect(result.result).toBe(value);
  expect(result.rawOutput.length).toBeLessThan(value.length * 3);
});

test.skipIf(process.platform === 'win32').each([
  ['默认值', '\r', 'rebake'],
  ['CRLF', 'ok\r\n', 'ok'],
] as const)('连续交互（%s）', async (_label, submission, expectedFirst) => {
  let invalidInputSent = false;
  let correctionSent = false;
  let secondInputSent = false;
  const result = await runPromptInTerminal('input.ts', {
    args: ['validate-next'],
    onData: (terminal, output) => {
      if (!invalidInputSent && output.includes(ANSI.CLEAR_TO_END)) {
        invalidInputSent = true;
        terminal.write('BAD\r');
      } else if (
        !correctionSent &&
        output.includes('Only lowercase letters are allowed.')
      ) {
        correctionSent = true;
        terminal.write(`${'\x7f'.repeat(3)}${submission}`);
      } else if (
        !secondInputSent &&
        stripVTControlCharacters(output).endsWith('second value (fallback): ')
      ) {
        secondInputSent = true;
        terminal.write('manual\r');
      }
    },
  });

  expect(result.exitCode).toBe(0);
  expect(JSON.parse(result.result)).toEqual({
    first: expectedFirst,
    second: 'manual',
  });
});

test.skipIf(process.platform === 'win32')('连续退格', async () => {
  const invalidValue = 'A'.repeat(1023);
  let invalidInputSent = false;
  let correctionSent = false;
  const result = await runPromptInTerminal('input.ts', {
    args: ['validate'],
    onData: (terminal, output) => {
      if (!invalidInputSent && output.includes(ANSI.CLEAR_TO_END)) {
        invalidInputSent = true;
        terminal.write(`${invalidValue}\r`);
      } else if (
        !correctionSent &&
        output.includes('Only lowercase letters are allowed.')
      ) {
        correctionSent = true;
        terminal.write(`${'\x7f'.repeat(1023)}a\r`);
      }
    },
  });

  expect(result.exitCode).toBe(0);
  expect(result.result).toBe('a');
  expect(result.rawOutput.length).toBeLessThan(invalidValue.length * 10);
});
