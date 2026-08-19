import { describe, expect, test } from 'bun:test';

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

  test('uses the current environment and respects the target stream', () => {
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
      expect(isColorEnabled({ isTTY: true })).toBeFalse();

      process.env['FORCE_COLOR'] = '1';
      expect(isColorEnabled({ isTTY: false })).toBeTrue();

      delete process.env['FORCE_COLOR'];
      process.env['NO_COLOR'] = '0';
      expect(isColorEnabled({ isTTY: true })).toBeFalse();

      delete process.env['NO_COLOR'];
      process.env['TERM'] = 'dumb';
      expect(isColorEnabled({ isTTY: true })).toBeFalse();

      process.env['TERM'] = 'xterm-256color';
      process.env['CI'] = '1';
      expect(isColorEnabled({ isTTY: true })).toBeFalse();

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
});
