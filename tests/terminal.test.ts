import { expect, test } from 'bun:test';

import {
  colorize,
  isColorEnabled,
  visibleTextWidth,
} from '#src/utils/terminal';

import { getColorEnv, runInTerminal, setColorEnv } from './helpers/terminal';

async function runColorInTerminal(
  variables: Record<string, string>,
): Promise<string> {
  const { exitCode, output } = await runInTerminal('color.ts', {
    env: getColorEnv(variables),
  });

  expect(exitCode).toBe(0);
  return output;
}

test('显示宽度', () => {
  expect(visibleTextWidth('\x1b[31mhello\x1b[0m')).toBe(5);
  expect(visibleTextWidth('中文')).toBe(4);
  expect(visibleTextWidth('👩‍👩‍👧‍👦')).toBe(2);
});

test('十六进制颜色', () => {
  const restoreColor = setColorEnv({ NO_COLOR: '1' });

  try {
    expect(() => colorize('#fff', 'Rebake')).toThrow('Expected #RRGGBB');
    expect(() => colorize(['#000000', '#ffffff'], 'Rebake')).toThrow(
      'Only one hexadecimal color',
    );
  } finally {
    restoreColor();
  }
});

test('颜色开关', () => {
  const restoreColor = setColorEnv({});

  try {
    expect(isColorEnabled({ isTTY: true })).toBeTrue();
    expect(isColorEnabled({ isTTY: false })).toBeFalse();

    process.env['FORCE_COLOR'] = '0';
    expect(isColorEnabled({ isTTY: true })).toBeTrue();
    expect(isColorEnabled({ isTTY: false })).toBeFalse();

    process.env['NO_COLOR'] = '1';
    expect(isColorEnabled({ isTTY: true })).toBeFalse();

    delete process.env['NO_COLOR'];
    process.env['FORCE_COLOR'] = '1';
    expect(isColorEnabled({ isTTY: false })).toBeTrue();

    process.env['NO_COLOR'] = '1';
    expect(isColorEnabled({ isTTY: false })).toBeTrue();

    delete process.env['FORCE_COLOR'];
    process.env['NO_COLOR'] = '0';
    expect(isColorEnabled({ isTTY: true })).toBeTrue();

    process.env['NO_COLOR'] = '1';
    expect(isColorEnabled({ isTTY: true })).toBeFalse();

    process.env['NO_COLOR'] = 'false';
    process.env['TERM'] = 'dumb';
    expect(isColorEnabled({ isTTY: true })).toBeTrue();

    process.env['TERM'] = 'xterm-256color';
    process.env['CI'] = '1';
    expect(isColorEnabled({ isTTY: true })).toBeTrue();

    process.env['GITHUB_ACTIONS'] = '1';
    expect(isColorEnabled({ isTTY: true })).toBeTrue();
  } finally {
    restoreColor();
  }
});

test.skipIf(process.platform === 'win32')('终端颜色输出', async () => {
  const colored = '\x1b[31mRebake\x1b[0m';

  expect(await runColorInTerminal({ FORCE_COLOR: '0' })).toBe(colored);
  expect(await runColorInTerminal({ NO_COLOR: '0' })).toBe(colored);
  expect(await runColorInTerminal({ TERM: 'dumb' })).toBe(colored);
  expect(await runColorInTerminal({ NO_COLOR: '1' })).toBe('Rebake');
  expect(await runColorInTerminal({ FORCE_COLOR: '1', NO_COLOR: '1' })).toBe(
    colored,
  );
});

test('强制着色', () => {
  const cases = [
    [
      ['0', '00', '+0', '-0', '+00', '0_0', '0__0', '-00___0', '+0_0__00'],
      false,
    ],
    [['', '1', '-1'], true],
    [['_0', '0_', '+_0', '+0_', '++0'], true],
    [['0x0', '0o0', '0b0', '0.0'], true],
    [[' 0', '0 ', '0\n'], true],
  ] as const;

  for (const [values, colored] of cases) {
    for (const value of values) {
      const restoreColor = setColorEnv({ FORCE_COLOR: value, NO_COLOR: '1' });
      const context = `FORCE_COLOR=${JSON.stringify(value)}`;

      try {
        expect(isColorEnabled({ isTTY: false }), context).toBe(colored);
        expect(colorize('red', 'Rebake'), context).toBe(
          colored ? '\x1b[31mRebake\x1b[0m' : 'Rebake',
        );
      } finally {
        restoreColor();
      }
    }
  }
});

test.skipIf(process.platform === 'win32')('终端颜色回退', async () => {
  for (const value of ['+0', '-0', '0__0', '+0_0__00']) {
    expect(await runColorInTerminal({ FORCE_COLOR: value })).toBe(
      '\x1b[31mRebake\x1b[0m',
    );
    expect(
      await runColorInTerminal({ FORCE_COLOR: value, NO_COLOR: '1' }),
    ).toBe('Rebake');
  }
});
