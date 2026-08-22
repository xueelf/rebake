import { stripANSI } from 'bun';
import { afterEach, describe, expect, mock, spyOn, test } from 'bun:test';
import { join } from 'node:path';

import { Command, execute, Option, Program } from '#src/index';
import { visibleTextWidth } from '#src/utils/terminal';

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

afterEach(() => {
  mock.restore();
});

function captureConsole(): { errors: string[]; logs: string[] } {
  const errors: string[] = [];
  const logs: string[] = [];

  spyOn(console, 'error').mockImplementation((...values: unknown[]) => {
    errors.push(values.map(String).join(' '));
  });
  spyOn(console, 'log').mockImplementation((...values: unknown[]) => {
    logs.push(values.map(String).join(' '));
  });

  return { errors, logs };
}

function overrideColorEnabled(enabled: boolean): () => void {
  const environment = new Map(
    COLOR_ENV_KEYS.map(key => [key, process.env[key]]),
  );

  for (const key of COLOR_ENV_KEYS) {
    delete process.env[key];
  }

  if (enabled) {
    process.env['FORCE_COLOR'] = '1';
  } else {
    process.env['NO_COLOR'] = '1';
  }

  return () => {
    for (const [key, value] of environment) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  };
}

async function runRuntimeError(
  env: Record<string, string | undefined>,
): Promise<{ exitCode: number; stderr: string; stdout: string }> {
  const subprocess = Bun.spawn({
    cmd: [process.execPath, join(import.meta.dir, 'fixtures/runtime-error.ts')],
    cwd: join(import.meta.dir, '..'),
    env,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    subprocess.exited,
    new Response(subprocess.stdout).text(),
    new Response(subprocess.stderr).text(),
  ]);

  return { exitCode, stderr, stdout };
}

describe('execute', () => {
  test('executes aliases, injects positionals, and applies options', () => {
    const calls: {
      args: readonly string[];
      output: string;
      verbose: boolean;
    }[] = [];

    @Command({ name: 'run', aliases: ['start'] })
    class RunCommand {
      @Option({ short: 'o' })
      static output = 'stdout';

      @Option({ short: 'V' })
      static verbose = false;

      constructor(...args: string[]) {
        calls.push({
          args,
          output: RunCommand.output,
          verbose: RunCommand.verbose,
        });
      }
    }

    @Program({ name: 'tool', commands: [RunCommand] })
    class Application {}

    execute(Application, [
      'start',
      '--output',
      'file.txt',
      '-V',
      'first',
      'second',
    ]);

    expect(calls).toEqual([
      {
        args: ['first', 'second'],
        output: 'file.txt',
        verbose: true,
      },
    ]);
  });

  test('resets static option values before every execution', () => {
    const values: { color: boolean; verbose: boolean }[] = [];

    @Command('run')
    class RunCommand {
      @Option()
      static color = true;

      @Option()
      static verbose = false;

      constructor() {
        values.push({
          color: RunCommand.color,
          verbose: RunCommand.verbose,
        });
      }
    }

    @Program({ commands: [RunCommand] })
    class Application {}

    execute(Application, ['run', '--no-color', '--verbose']);
    execute(Application, ['run']);

    expect(values).toEqual([
      { color: false, verbose: true },
      { color: true, verbose: false },
    ]);
  });

  test('preserves static options when the command does not execute', () => {
    captureConsole();

    @Command('run')
    class RunCommand {
      @Option()
      static cache = true;

      @Option()
      static verbose = false;
    }

    @Program({ commands: [RunCommand] })
    class Application {}

    execute(Application, ['run', '--no-cache', '--verbose']);

    expect(RunCommand.cache).toBeFalse();
    expect(RunCommand.verbose).toBeTrue();

    execute(Application, ['run', '--help']);

    expect(RunCommand.cache).toBeFalse();
    expect(RunCommand.verbose).toBeTrue();

    const exit = spyOn(process, 'exit').mockImplementation(code => {
      throw new Error(`EXIT:${code}`);
    });

    expect(() => execute(Application, ['run', '--unknown'])).toThrow('EXIT:1');
    expect(RunCommand.cache).toBeFalse();
    expect(RunCommand.verbose).toBeTrue();

    expect(() =>
      execute(Application, ['run', '--cache', '--no-cache']),
    ).toThrow('EXIT:1');
    expect(RunCommand.cache).toBeFalse();
    expect(RunCommand.verbose).toBeTrue();
    expect(exit).toHaveBeenCalledTimes(2);
    expect(exit).toHaveBeenLastCalledWith(1);
  });

  test('renders global and command help and prints the version', () => {
    const { logs } = captureConsole();

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

    execute(Application, ['--version']);
    expect(logs.at(-1)).toBe('1.2.3');

    execute(Application, ['--help']);
    expect(stripANSI(logs.at(-1) ?? '')).toBe(
      'tool is a command line tool. (1.2.3)\n' +
        '\n' +
        'Usage: tool <command> [...flags] [...args]\n' +
        '\n' +
        'Commands:\n' +
        '  build     <target>             Build a target. (tool b)\n' +
        '\n' +
        '  <command> --help               Print help text for command.\n' +
        '\n' +
        'Flags:\n' +
        '  -h, --help                          Display this menu and exit\n' +
        '  -v, --version                       Print version and exit\n' +
        '\n' +
        'Homepage                         https://example.com',
    );

    execute(Application, []);
    expect(stripANSI(logs.at(-1) ?? '')).not.toContain('\nFlags:\n');

    execute(Application, ['build', '--help']);

    const commandHelp = stripANSI(logs.at(-1) ?? '');

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

  test('renders examples verbatim without using them as command synopses', () => {
    const { logs } = captureConsole();

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

    execute(Application, []);

    const topLevelHelp = stripANSI(logs.at(-1) ?? '');

    expect(topLevelHelp).toContain(
      '  build     <target>             Build a target. (tool b)',
    );
    expect(topLevelHelp).not.toContain('tool b app');
    expect(topLevelHelp).not.toContain('custom invocation');

    execute(Application, ['b', '--help']);

    const commandHelp = stripANSI(logs.at(-1) ?? '');

    expect(commandHelp).toContain(
      '  Use the alias.\n  tool b app\n\n  custom invocation',
    );
  });

  test('reports user input errors and exits with a failure status', () => {
    const { errors } = captureConsole();
    const exit = spyOn(process, 'exit').mockImplementation(code => {
      throw new Error(`EXIT:${code}`);
    });

    @Command('run')
    class RunCommand {}

    @Program({ name: 'tool', commands: [RunCommand] })
    class Application {}

    expect(() => execute(Application, ['--unknown'])).toThrow('EXIT:1');
    expect(stripANSI(errors.at(-1) ?? '')).toContain(
      "Unknown option '--unknown'",
    );
    expect(exit).toHaveBeenLastCalledWith(1);

    expect(() => execute(Application, ['--no-help'])).toThrow('EXIT:1');
    expect(stripANSI(errors.at(-1) ?? '')).toContain(
      "Unknown option '--no-help'",
    );
    expect(exit).toHaveBeenLastCalledWith(1);

    expect(() => execute(Application, ['missing'])).toThrow('EXIT:1');
    expect(stripANSI(errors.at(-1) ?? '')).toContain(
      'Command "missing" not found',
    );
    expect(exit).toHaveBeenLastCalledWith(1);

    expect(() => execute(Application, [''])).toThrow('EXIT:1');
    expect(stripANSI(errors.at(-1) ?? '')).toContain('Command "" not found');
    expect(exit).toHaveBeenLastCalledWith(1);
  });

  test('writes parser errors to stderr and exits the process', async () => {
    const plainEnvironment: Record<string, string | undefined> = {
      ...process.env,
      NO_COLOR: '1',
    };

    delete plainEnvironment['FORCE_COLOR'];

    const plainResult = await runRuntimeError(plainEnvironment);

    expect(plainResult.exitCode).toBe(1);
    expect(plainResult.stdout).toBe('');
    expect(plainResult.stderr).toBe("error: Unknown option '--unknown'\n");

    const coloredEnvironment: Record<string, string | undefined> = {
      ...process.env,
    };

    for (const key of COLOR_ENV_KEYS) {
      delete coloredEnvironment[key];
    }
    coloredEnvironment['TERM'] = 'xterm-256color';

    const coloredResult = await runRuntimeError(coloredEnvironment);

    expect(coloredResult.exitCode).toBe(1);
    expect(coloredResult.stdout).toBe('');
    expect(coloredResult.stderr).toStartWith('\x1b[0m\x1b[31merror');
  });

  test('rejects invalid program and command definitions', () => {
    class MissingProgramDecorator {}

    expect(() => execute(MissingProgramDecorator, [])).toThrow(
      'must be decorated with @Program()',
    );

    class MissingCommandDecorator {}

    @Program({ commands: [MissingCommandDecorator] })
    class MissingCommandApplication {}

    expect(() => execute(MissingCommandApplication, [])).toThrow(
      'must be decorated with @Command()',
    );

    @Command(JSON.parse('{}'))
    class MissingCommandName {}

    @Program({ commands: [MissingCommandName] })
    class MissingCommandNameApplication {}

    expect(() => execute(MissingCommandNameApplication, [])).toThrow(
      'Command name must be a string.',
    );

    @Command(JSON.parse('{"name":1}'))
    class InvalidCommandName {}

    @Program({ commands: [InvalidCommandName] })
    class InvalidCommandNameApplication {}

    expect(() => execute(InvalidCommandNameApplication, [])).toThrow(
      'Command name must be a string.',
    );

    @Command({ name: 'first', aliases: ['shared'] })
    class FirstCommand {}

    @Command({ name: 'second', aliases: ['shared'] })
    class SecondCommand {}

    @Program({ commands: [FirstCommand, SecondCommand] })
    class DuplicateAliasApplication {}

    expect(() => execute(DuplicateAliasApplication, [])).toThrow(
      'Command name or alias "shared" is shared',
    );

    @Command({ name: 'empty-example', examples: [{ syntax: '  ' }] })
    class EmptyExampleCommand {}

    @Program({ commands: [EmptyExampleCommand] })
    class EmptyExampleApplication {}

    expect(() => execute(EmptyExampleApplication, [])).toThrow(
      'Example syntax for command "empty-example" cannot be empty.',
    );
  });

  test('rejects duplicate option short names', () => {
    @Command('run')
    class RunCommand {
      @Option({ short: 'x' })
      static first = false;

      @Option({ short: 'x' })
      static second = false;
    }

    @Program({ commands: [RunCommand] })
    class Application {}

    expect(() => execute(Application, [])).toThrow(
      'declares the short option "x" more than once',
    );
  });

  test('renders and parses Bun-compatible short and negated options', () => {
    const { errors, logs } = captureConsole();
    const values: { cache: boolean; x: boolean }[] = [];

    @Command('run')
    class RunCommand {
      @Option({ description: 'Enable x.' })
      static x = false;

      @Option({ short: 'c', description: 'Configure cache.' })
      static cache = true;

      @Option()
      static hidden = false;

      constructor() {
        values.push({
          cache: RunCommand.cache,
          x: RunCommand.x,
        });
      }
    }

    @Program({ name: 'tool', commands: [RunCommand] })
    class Application {}

    execute(Application, ['run', '--help']);

    const help = stripANSI(logs.at(-1) ?? '');

    expect(help).toContain('  -x, --x');
    expect(help).toContain('      --no-cache');
    expect(help).not.toContain('--hidden');

    execute(Application, ['run', '-x', '--no-cache']);

    expect(values).toEqual([{ cache: false, x: true }]);

    const exit = spyOn(process, 'exit').mockImplementation(code => {
      throw new Error(`EXIT:${code}`);
    });

    expect(() =>
      execute(Application, ['run', '--cache', '--no-cache']),
    ).toThrow('EXIT:1');
    expect(stripANSI(errors.at(-1) ?? '')).toContain(
      'Options "--cache" and "--no-cache" cannot be used together.',
    );
    expect(exit).toHaveBeenCalledWith(1);
  });

  test('aligns Unicode flag descriptions using terminal column widths', () => {
    const { logs } = captureConsole();

    @Command('run')
    class RunCommand {
      @Option({ description: 'English option.' })
      static english = false;

      @Option({ description: 'Chinese option.' })
      static ['输出目录'] = false;
    }

    @Program({ name: 'tool', commands: [RunCommand] })
    class Application {}

    execute(Application, ['run', '--help']);

    const lines = stripANSI(logs.at(-1) ?? '').split('\n');
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

  test('uses Bun help ANSI sequences for usage and flags', () => {
    const { logs } = captureConsole();
    const restoreColor = overrideColorEnabled(true);

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

      execute(Application, ['build', '--help']);

      const help = logs.at(-1) ?? '';

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

      execute(Application, []);

      const topLevelHelp = logs.at(-1) ?? '';

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

  test('preserves command names that also occur inside ANSI sequences', () => {
    const { logs } = captureConsole();
    const forceColor = process.env['FORCE_COLOR'];
    const noColor = process.env['NO_COLOR'];
    const nodeDisableColors = process.env['NODE_DISABLE_COLORS'];

    try {
      process.env['FORCE_COLOR'] = '1';
      delete process.env['NO_COLOR'];
      delete process.env['NODE_DISABLE_COLORS'];

      @Command({ name: 'm', category: 'styled' })
      class MCommand {}

      @Program({
        name: 'tool',
        commands: [MCommand],
        categories: {
          styled: 'green',
        },
      })
      class Application {}

      execute(Application, []);

      const help = logs.at(-1) ?? '';

      expect(help).toContain('  \x1b[1m\x1b[32mm\x1b[0m');
      expect(stripANSI(help)).toContain('\n  m');
    } finally {
      if (forceColor === undefined) {
        delete process.env['FORCE_COLOR'];
      } else {
        process.env['FORCE_COLOR'] = forceColor;
      }

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
    }
  });

  test('validates category colors before execution without color', () => {
    const restoreColor = overrideColorEnabled(false);
    let executionCount = 0;

    try {
      @Command({ name: 'build', category: 'project' })
      class BuildCommand {
        constructor() {
          executionCount += 1;
        }
      }

      @Program({
        commands: [BuildCommand],
        categories: {
          project: '#fff',
        },
      })
      class Application {}

      expect(() => execute(Application, ['build'])).toThrow(
        'Invalid hexadecimal color "#fff". Expected #RRGGBB.',
      );

      const categories = JSON.parse('{"project":"banana"}');

      @Program({ commands: [BuildCommand], categories })
      class InvalidNamedStyleApplication {}

      expect(() => execute(InvalidNamedStyleApplication, ['build'])).toThrow(
        "Received 'banana'",
      );
      expect(executionCount).toBe(0);
    } finally {
      restoreColor();
    }
  });

  test('rejects option names that Bun parseArgs cannot expose', () => {
    @Command('negative')
    class NegativeCommand {
      @Option()
      static ['no-cache'] = false;
    }

    @Program({ commands: [NegativeCommand] })
    class NegativeApplication {}

    expect(() => execute(NegativeApplication, [])).toThrow(
      'cannot start with "no-"',
    );

    @Command('equals')
    class EqualsCommand {
      @Option()
      static ['output=value'] = '';
    }

    @Program({ commands: [EqualsCommand] })
    class EqualsApplication {}

    expect(() => execute(EqualsApplication, [])).toThrow('cannot contain "="');

    @Command('prototype')
    class PrototypeCommand {
      @Option()
      static ['__proto__'] = false;
    }

    @Program({ commands: [PrototypeCommand] })
    class PrototypeApplication {}

    expect(() => execute(PrototypeApplication, [])).toThrow(
      'cannot be named "__proto__"',
    );

    @Command('control')
    class ControlCommand {
      @Option()
      static ['bad\u001b[31m'] = false;
    }

    @Program({ commands: [ControlCommand] })
    class ControlApplication {}

    expect(() => execute(ControlApplication, [])).toThrow(
      'contain whitespace or control characters',
    );
  });

  test('handles category names inherited from Object.prototype', () => {
    const { logs } = captureConsole();

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

    expect(() => execute(Application, [])).not.toThrow();
    expect(stripANSI(logs.at(-1) ?? '')).toContain('inspect');
  });
});
