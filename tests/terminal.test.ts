import { describe, expect, test } from 'bun:test';

import {
  colorize,
  isColorEnabled,
  visibleTextWidth,
} from '#src/utils/terminal';

describe('terminal utilities', () => {
  test('measures ANSI text, emoji, and wide characters by terminal columns', () => {
    expect(visibleTextWidth(colorize('red', 'hello'))).toBe(5);
    expect(visibleTextWidth('中文')).toBe(4);
    expect(visibleTextWidth('👩‍👩‍👧‍👦')).toBe(2);
  });

  test('validates hexadecimal colors', () => {
    const noColor = process.env['NO_COLOR'];
    const nodeDisableColors = process.env['NODE_DISABLE_COLORS'];
    const forceColor = process.env['FORCE_COLOR'];

    try {
      delete process.env['NO_COLOR'];
      delete process.env['NODE_DISABLE_COLORS'];
      process.env['FORCE_COLOR'] = '1';

      expect(colorize('red', 'Rebake')).toContain('\x1b[31m');
      expect(colorize('#57b497', 'Rebake')).toContain('38;2;87;180;151');
      expect(() => colorize('#fff', 'Rebake')).toThrow('Expected #RRGGBB');
      expect(() => colorize(['#000000', '#ffffff'], 'Rebake')).toThrow(
        'Only one hexadecimal color',
      );

      delete process.env['FORCE_COLOR'];
      expect(() => colorize('#fff', 'Rebake')).toThrow('Expected #RRGGBB');
    } finally {
      if (noColor === undefined) {
        delete process.env['NO_COLOR'];
      } else {
        process.env['NO_COLOR'] = noColor;
      }

      if (nodeDisableColors === undefined) {
        delete process.env['NODE_DISABLE_COLORS'];
      } else {
        process.env['NODE_DISABLE_COLORS'] = nodeDisableColors;
      }

      if (forceColor === undefined) {
        delete process.env['FORCE_COLOR'];
      } else {
        process.env['FORCE_COLOR'] = forceColor;
      }
    }
  });

  test('uses Bun color depth and respects the target stream', () => {
    const environmentKeys = [
      'NO_COLOR',
      'NODE_DISABLE_COLORS',
      'FORCE_COLOR',
      'TERM',
      'TMUX',
      'CI',
      'GITHUB_ACTIONS',
      'TERM_PROGRAM',
      'TERM_PROGRAM_VERSION',
      'COLORTERM',
    ] as const;
    const environment = new Map(
      environmentKeys.map(key => [key, process.env[key]]),
    );

    try {
      for (const key of environmentKeys) {
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

      delete process.env['CI'];
      delete process.env['GITHUB_ACTIONS'];
      delete process.env['TERM'];
      process.env['TERM_PROGRAM'] = 'Apple_Terminal';
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
