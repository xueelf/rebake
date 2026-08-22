import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';

import {
  colorize,
  isColorEnabled,
  visibleTextWidth,
} from '#src/utils/terminal';

const COLOR_ENV_KEYS = [
  'CI',
  'COLORTERM',
  'FORCE_COLOR',
  'GITHUB_ACTIONS',
  'NODE_DISABLE_COLORS',
  'NO_COLOR',
  'TERM',
  'TERM_PROGRAM',
  'TERM_PROGRAM_VERSION',
  'TMUX',
] as const;

async function runColorInTerminal(
  variables: Record<string, string>,
): Promise<string> {
  const decoder = new TextDecoder();
  const env: Record<string, string | undefined> = { ...process.env };
  let output = '';
  const { promise: terminalExited, resolve: resolveTerminalExit } =
    Promise.withResolvers<void>();

  // 隔离所有颜色相关变量，避免本机终端和 CI 环境改变原始 ANSI 输出。
  for (const key of COLOR_ENV_KEYS) {
    delete env[key];
  }
  env['TERM'] = 'xterm-256color';
  Object.assign(env, variables);

  const subprocess = Bun.spawn({
    cmd: [process.execPath, join(import.meta.dir, 'fixtures/color.ts')],
    cwd: join(import.meta.dir, '..'),
    env,
    terminal: {
      data(_terminal, data) {
        output += decoder.decode(data, { stream: true });
      },
      exit() {
        resolveTerminalExit();
      },
    },
  });
  const [exitCode] = await Promise.all([subprocess.exited, terminalExited]);

  // 流式解码器可能保留尾部字节，进程结束后必须主动刷新。
  output += decoder.decode();
  expect(exitCode).toBe(0);

  return output;
}

describe('terminal utilities', () => {
  test('measures ANSI text, emoji, and wide characters by terminal columns', () => {
    expect(visibleTextWidth(colorize('red', 'hello'))).toBe(5);
    expect(visibleTextWidth('中文')).toBe(4);
    expect(visibleTextWidth('👩‍👩‍👧‍👦')).toBe(2);
  });

  test('validates hexadecimal colors regardless of color state', () => {
    expect(() => colorize('#fff', 'Rebake')).toThrow('Expected #RRGGBB');
    expect(() => colorize(['#000000', '#ffffff'], 'Rebake')).toThrow(
      'Only one hexadecimal color',
    );
  });

  test('uses Bun color environment values for the target stream', () => {
    const environment = new Map(
      COLOR_ENV_KEYS.map(key => [key, process.env[key]]),
    );

    try {
      for (const key of COLOR_ENV_KEYS) {
        delete process.env[key];
      }
      process.env['TERM'] = 'xterm-256color';

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
      for (const [key, value] of environment) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    }
  });

  test('emits Bun color output in a real terminal', async () => {
    const colored = '\x1b[31mRebake\x1b[0m';

    expect(await runColorInTerminal({ FORCE_COLOR: '0' })).toBe(colored);
    expect(await runColorInTerminal({ NO_COLOR: '0' })).toBe(colored);
    expect(await runColorInTerminal({ TERM: 'dumb' })).toBe(colored);
    expect(await runColorInTerminal({ NO_COLOR: '1' })).toBe('Rebake');
    expect(await runColorInTerminal({ FORCE_COLOR: '1', NO_COLOR: '1' })).toBe(
      colored,
    );
  });
});
