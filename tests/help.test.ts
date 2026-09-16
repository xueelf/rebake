import { stripANSI } from 'bun';
import { expect, test } from 'bun:test';
import { stripVTControlCharacters } from 'node:util';

import { Command, Option, Program } from '#src/index';
import { createProgramDefinition } from '#src/runtime/definition';
import { renderCommandHelp, renderTopLevelHelp } from '#src/runtime/help';
import { visibleTextWidth } from '#src/utils/terminal';

import { getColorEnv, runInTerminal, setColorEnv } from './helpers/terminal';

test('帮助内容', () => {
  @Command({
    name: 'build',
    aliases: ['b'],
    args: '<target>',
    description: 'Build a target.',
    category: 'project',
    examples: [
      {
        syntax: 'tool build app',
        description: 'Build the application.',
      },
      {
        syntax: 'tool build library',
        description: 'Build the library.',
      },
    ],
    epilog: ['Build artifacts are written to the output directory.'],
  })
  class BuildCommand {
    @Option({ short: 'o', description: 'Output directory.' })
    static output = 'dist';
  }

  @Program({
    name: 'tool',
    version: '1.2.3',
    commands: [BuildCommand],
    categories: {
      project: '#57b497',
    },
    details: {
      Homepage: 'https://example.com',
    },
  })
  class Application {}

  const program = createProgramDefinition(Application);

  expect(stripANSI(renderTopLevelHelp(program, true))).toBe(
    'tool is a command line tool. (1.2.3)\n' +
      '\n' +
      'Usage: tool <command> [...flags] [...args]\n' +
      '\n' +
      'Commands:\n' +
      '  build     <target>             Build a target. (tool b)\n' +
      '\n' +
      '  <command> --help               Print help text for command\n' +
      '\n' +
      'Flags:\n' +
      '  -h, --help                          Display this menu and exit\n' +
      '  -v, --version                       Print version and exit\n' +
      '\n' +
      'Homepage                         https://example.com',
  );

  expect(stripANSI(renderTopLevelHelp(program))).not.toContain('\nFlags:\n');

  const commandHelp = stripANSI(
    renderCommandHelp(program, program.commands[0]!),
  );

  expect(commandHelp).toBe(
    'Usage: tool build [flags] <target>\n' +
      'Alias: tool b\n' +
      '  Build a target.\n' +
      '\n' +
      'Flags:\n' +
      '  -h, --help            Display this menu and exit\n' +
      '  -o, --output=<val>    Output directory.\n' +
      '\n' +
      'Examples:\n' +
      '  Build the application.\n' +
      '  tool build app\n' +
      '\n' +
      '  Build the library.\n' +
      '  tool build library\n' +
      '\n' +
      'Build artifacts are written to the output directory.',
  );
});

test('示例与参数概要', () => {
  @Command({
    name: 'build',
    aliases: ['b'],
    args: '<target>',
    description: 'Build a target.',
    examples: [
      {
        syntax: 'tool b app',
        description: 'Use the alias.',
      },
      {
        syntax: 'custom invocation',
      },
    ],
  })
  class BuildCommand {}

  @Program({ name: 'tool', commands: [BuildCommand] })
  class Application {}

  const program = createProgramDefinition(Application);
  const topLevelHelp = stripANSI(renderTopLevelHelp(program));

  expect(topLevelHelp).toContain(
    '  build     <target>             Build a target. (tool b)',
  );
  expect(topLevelHelp).not.toContain('tool b app');
  expect(topLevelHelp).not.toContain('custom invocation');

  const commandHelp = stripANSI(
    renderCommandHelp(program, program.commands[0]!),
  );

  expect(commandHelp).toContain(
    '  Use the alias.\n  tool b app\n\n  custom invocation',
  );
});

test('选项列对齐', () => {
  @Command('run')
  class RunCommand {
    @Option({ description: 'English option.' })
    static english = false;

    @Option({ description: 'Chinese option.' })
    static ['输出目录'] = false;
  }

  @Program({ name: 'tool', commands: [RunCommand] })
  class Application {}

  const program = createProgramDefinition(Application);
  const lines = stripANSI(
    renderCommandHelp(program, program.commands[0]!),
  ).split('\n');
  const englishLine =
    lines.find(line => line.includes('English option.')) ?? '';
  const chineseLine =
    lines.find(line => line.includes('Chinese option.')) ?? '';
  const englishDescriptionColumn = visibleTextWidth(
    englishLine.slice(0, englishLine.indexOf('English option.')),
  );
  const chineseDescriptionColumn = visibleTextWidth(
    chineseLine.slice(0, chineseLine.indexOf('Chinese option.')),
  );

  expect(englishDescriptionColumn).toBe(chineseDescriptionColumn);
});

test('ANSI 样式', () => {
  const restoreColor = setColorEnv({ FORCE_COLOR: '1' });

  try {
    @Command({
      name: 'build',
      args: '<target>',
      category: 'project',
      examples: [{ syntax: 'tool build app' }],
    })
    class BuildCommand {
      @Option({ short: 'o', description: 'Output directory.' })
      static output = 'dist';
    }

    @Program({
      name: 'tool',
      commands: [BuildCommand],
      categories: {
        project: 'green',
      },
    })
    class Application {}

    const program = createProgramDefinition(Application);
    const help = renderCommandHelp(program, program.commands[0]!);

    expect(help).toStartWith(
      '\x1b[1mUsage\x1b[0m: ' +
        '\x1b[1m\x1b[32mtool build\x1b[0m ' +
        '\x1b[36m[flags]\x1b[0m ' +
        '\x1b[34m<target>\x1b[0m',
    );
    expect(help).toContain(
      '  \x1b[36m-o\x1b[0m, ' +
        '\x1b[36m--output\x1b[0m' +
        '\x1b[2m\x1b[36m=<val>\x1b[0m',
    );
    expect(help).toContain('  \x1b[1m\x1b[32mtool build app\x1b[0m');

    const topLevelHelp = renderTopLevelHelp(program);

    expect(topLevelHelp).toStartWith(
      '\x1b[0mtool is a command line tool.\n\n' +
        '\x1b[1mUsage:\x1b[0m ' +
        '\x1b[1mtool <command> ' +
        '\x1b[36m[...flags]\x1b[0m ' +
        '\x1b[1m[...args]\x1b[0m',
    );
    expect(topLevelHelp).toContain('  \x1b[1m\x1b[32mbuild\x1b[0m');
  } finally {
    restoreColor();
  }
});

test('ANSI 参数同名命令', () => {
  const restoreColor = setColorEnv({ FORCE_COLOR: '1' });

  try {
    @Command({ name: 'm', category: 'styled' })
    class MCommand {}

    @Program({
      name: 'tool',
      commands: [MCommand],
      categories: { styled: 'green' },
    })
    class Application {}

    const help = renderTopLevelHelp(createProgramDefinition(Application));

    expect(help).toContain('  \x1b[1m\x1b[32mm\x1b[0m');
    expect(stripANSI(help)).toContain('\n  m');
  } finally {
    restoreColor();
  }
});

test('对象原型属性分类名', () => {
  @Command({
    name: 'inspect',
    category: 'toString',
  })
  class InspectCommand {}

  @Program({
    name: 'tool',
    commands: [InspectCommand],
    categories: {},
  })
  class Application {}

  const program = createProgramDefinition(Application);

  expect(() => renderTopLevelHelp(program)).not.toThrow();
  expect(stripANSI(renderTopLevelHelp(program))).toContain('inspect');
});

test('选项显示', () => {
  @Command('run')
  class RunCommand {
    @Option({ description: 'Enable x.' })
    static x = false;

    @Option({ short: 'c', description: 'Configure cache.' })
    static cache = true;

    @Option()
    static hidden = false;
  }

  @Program({ name: 'tool', commands: [RunCommand] })
  class Application {}

  const program = createProgramDefinition(Application);
  const help = stripANSI(renderCommandHelp(program, program.commands[0]!));

  expect(help).toContain('  -x, --x');
  expect(help).toContain('      --no-cache');
  expect(help).not.toContain('--hidden');
});

test.skipIf(process.platform === 'win32').each([
  ['无色', false],
  ['彩色', true],
] as const)('全角短选项：%s', async (_label, color) => {
  const { exitCode, output } = await runInTerminal('help.ts', {
    env: getColorEnv(color ? { FORCE_COLOR: '1' } : { NO_COLOR: '1' }),
  });

  expect(exitCode).toBe(0);

  const descriptions = ['English', 'Chinese', 'String'];
  const lines = stripVTControlCharacters(output).split('\r\n');
  const columns = descriptions.map(description => {
    const line = lines.find(value => value.includes(description))!;

    return Bun.stringWidth(line.slice(0, line.indexOf(description)));
  });
  const cyan = color ? '\x1b[36m' : '';
  const dim = color ? '\x1b[2m' : '';
  const reset = color ? '\x1b[0m' : '';

  expect(columns).toEqual([21, 21, 21]);
  expect(output).toContain(
    `  ${cyan}-h${reset}, ${cyan}--help${reset}         Display this menu and exit\r\n` +
      `      ${cyan}--english${reset}      English description\r\n` +
      `  ${cyan}-中${reset}, ${cyan}--中${reset}          Chinese description\r\n` +
      `  ${cyan}-文${reset}, ${cyan}--文${reset}${dim}${cyan}=<val>${reset}    String description\r\n`,
  );
});
