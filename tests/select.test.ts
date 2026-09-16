import { expect, test } from 'bun:test';

import { select } from '#src/prompts/select';
import { ANSI } from '#src/utils/terminal';

import { runPromptFromPipe, runPromptInTerminal } from './helpers/prompts';
import { getColorEnv } from './helpers/terminal';

async function runSelectInTerminal(
  inputBytes: readonly number[],
  color = false,
  scenario = 'default',
  terminalSize: { cols?: number; rows?: number } = {},
) {
  let inputSent = false;

  return runPromptInTerminal('select.ts', {
    args: [scenario],
    env: getColorEnv(color ? { FORCE_COLOR: '1' } : { NO_COLOR: '1' }),
    ...terminalSize,
    onData(terminal, output) {
      // 等待首屏完整渲染后再发送按键，避免测试与终端初始化竞争。
      if (!inputSent && output.includes(ANSI.ERASE_DOWN)) {
        inputSent = true;
        terminal.write(Uint8Array.from(inputBytes));
      }
    },
  });
}

test('配置项', () => {
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

test('无可用选项', () => {
  expect(select('Choose', [])).toBeNull();
  expect(select('Choose', [{ value: 'vue', disabled: true }])).toBeNull();
});

test('终端状态恢复', async () => {
  const result = await runPromptFromPipe('select-error.ts', {
    env: getColorEnv({ FORCE_COLOR: '1' }),
  });

  expect(result.exitCode).toBe(0);
  expect(result.stderr).toBe('');
  expect(JSON.parse(result.result)).toEqual({
    cursorRestored: true,
    errorMessage: 'simulated final render failure',
    rawModes: [true, false],
  });
});

test('读取错误', async () => {
  const result = await runPromptFromPipe('select.ts', {
    args: ['read-error'],
  });

  expect(result.exitCode).toBe(0);
  expect(result.result).toBe('first');
});

test('连续交互（选择后输入）', async () => {
  const result = await runPromptFromPipe('select.ts', {
    args: ['then-input'],
    input: '2alice\n',
  });

  expect(JSON.parse(result.result)).toEqual({
    choice: 'second',
    name: 'alice',
  });
});

test('终端模式错误', async () => {
  const result = await runPromptFromPipe('select-raw-mode-error.ts', {
    input: '',
  });

  expect(result.exitCode).toBe(0);
  expect(JSON.parse(result.result)).toEqual({
    errorMessage: '',
    rawModes: [true, false, true, false],
    values: ['first', 'second'],
  });
});

test('初始选项与禁用项', async () => {
  const selected = await runPromptFromPipe('select.ts', {
    args: ['states'],
    input: '',
  });
  const next = await runPromptFromPipe('select.ts', {
    args: ['states'],
    input: Uint8Array.from([106, 13]),
  });
  const disabledShortcut = await runPromptFromPipe('select.ts', {
    args: ['states'],
    input: Uint8Array.from([49, 13]),
  });

  expect(selected.result).toBe('selected');
  expect(next.result).toBe('other');
  expect(disabledShortcut.result).toBe('selected');
});

test.skipIf(process.platform === 'win32')('方向键导航', async () => {
  const result = await runSelectInTerminal([27, 91, 66, 13]);

  expect(result.exitCode).toBe(0);
  expect(result.output).toContain(
    '? Select a project template - Press return to submit.\n',
  );
  expect(result.output).toContain('✓ Select a project template: React\n');
  expect(result.output).not.toContain('Cancelled');
  expect(result.result).toBe('react');
});

test.skipIf(process.platform === 'win32')('取消选择（无色）', async () => {
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

test.skipIf(process.platform === 'win32')('取消选择（彩色）', async () => {
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

test.skipIf(process.platform === 'win32')('导航与取消按键', async () => {
  const selected = await runSelectInTerminal([106, 13]);
  const cancelled = await runSelectInTerminal([27, 27]);
  const endOfTransmission = await runPromptFromPipe('select.ts', {
    args: ['default'],
    input: Uint8Array.from([4]),
  });

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

test.skipIf(process.platform === 'win32')('无效按键序列', async () => {
  const uppercase = await runPromptFromPipe('select.ts', {
    args: ['default'],
    input: Uint8Array.from([74, 13]),
  });
  const applicationCursor = await runPromptFromPipe('select.ts', {
    args: ['default'],
    input: Uint8Array.from([27, 79, 66]),
  });
  const incompleteArrow = await runPromptFromPipe('select.ts', {
    args: ['default'],
    input: Uint8Array.from([27, 91]),
  });

  expect(uppercase.result).toBe('blank');
  expect(applicationCursor.result).toBe('');
  expect(incompleteArrow.result).toBe('');
  expect(incompleteArrow.output).toContain(
    '✓ Select a project template: Blank\n\nx Cancelled\n',
  );
});

test.skipIf(process.platform === 'win32')('数字选择', async () => {
  const result = await runSelectInTerminal([50]);

  expect(result.output).toContain(
    '✓ Select a project template: Blank\nRESULT=react\n',
  );
  expect(result.result).toBe('react');
});

test.skipIf(process.platform === 'win32')('无效按键重绘', async () => {
  const result = await runSelectInTerminal([122, 13]);

  expect(result.output.match(/ {7}Blank/g)).toHaveLength(2);
  expect(result.result).toBe('blank');
});

test.skipIf(process.platform === 'win32')('EOF 确认', async () => {
  const result = await runPromptFromPipe('select.ts', { args: ['default'] });

  expect(result.exitCode).toBe(0);
  expect(result.output).toContain('✓ Select a project template: Blank\n');
  expect(result.result).toBe('blank');
});

test.skipIf(process.platform === 'win32')('列表滚动', async () => {
  const result = await runSelectInTerminal([106, 106, 106, 13], false, 'many', {
    cols: 80,
    rows: 5,
  });

  expect(result.exitCode).toBe(0);
  expect(result.result).toBe('4');
  expect(result.output).toContain('✓ Choose: Choice 4\n');
  expect(result.rawOutput).toContain(ANSI.CURSOR_UP(3));
  expect(result.rawOutput).toContain(ANSI.CURSOR_UP(4));
  expect(result.rawOutput).not.toContain(ANSI.CURSOR_UP(8));
  expect(result.rawOutput).not.toContain(ANSI.CURSOR_UP(9));
});
