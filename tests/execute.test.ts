import { stripANSI } from 'bun';
import { afterEach, expect, expectTypeOf, mock, spyOn, test } from 'bun:test';

import { Command, execute, Option, Program } from '#src/index';

import { getColorEnv, runFromPipe, setColorEnv } from './helpers/terminal';

afterEach(() => {
  mock.restore();
});

function captureErrors(): string[] {
  const errors: string[] = [];

  spyOn(console, 'error').mockImplementation((...values: unknown[]) => {
    errors.push(values.map(String).join(' '));
  });
  spyOn(console, 'log').mockImplementation(() => undefined);

  return errors;
}

test('别名与参数传递', () => {
  expectTypeOf<ReturnType<typeof execute>>().toEqualTypeOf<void>();

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

test('选项重置', () => {
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

test('字段初始化顺序', () => {
  const values: boolean[][] = [];

  function enableOption(_target: undefined) {
    return (_initialValue: boolean): boolean => true;
  }

  @Command('run')
  class RunCommand {
    @Option()
    @enableOption
    static first = false;

    @enableOption
    @Option()
    static second = false;

    constructor() {
      values.push([RunCommand.first, RunCommand.second]);
    }
  }

  @Program({ commands: [RunCommand] })
  class Application {}

  expect([RunCommand.first, RunCommand.second]).toEqual([true, true]);

  execute(Application, ['run']);
  execute(Application, ['run', '--no-first', '--no-second']);
  execute(Application, ['run']);

  expect(values).toEqual([
    [true, true],
    [false, false],
    [true, true],
  ]);
});

test('非执行路径的选项状态', () => {
  captureErrors();

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

  expect(() => execute(Application, ['run', '--cache', '--no-cache'])).toThrow(
    'EXIT:1',
  );
  expect(RunCommand.cache).toBeFalse();
  expect(RunCommand.verbose).toBeTrue();
  expect(exit).toHaveBeenCalledTimes(2);
  expect(exit).toHaveBeenLastCalledWith(1);
});

test('输入错误', () => {
  const errors = captureErrors();
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

test('短选项与反向开关', () => {
  const errors = captureErrors();
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

  execute(Application, ['run', '-x', '--no-cache']);

  expect(values).toEqual([{ cache: false, x: true }]);

  const exit = spyOn(process, 'exit').mockImplementation(code => {
    throw new Error(`EXIT:${code}`);
  });

  expect(() => execute(Application, ['run', '--cache', '--no-cache'])).toThrow(
    'EXIT:1',
  );
  expect(stripANSI(errors.at(-1) ?? '')).toContain(
    'Options "--cache" and "--no-cache" cannot be used together.',
  );
  expect(exit).toHaveBeenCalledWith(1);
});

test('分类颜色校验', () => {
  const restoreColor = setColorEnv({ NO_COLOR: '1' });
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

test('帮助与版本分发', async () => {
  const [version, topLevel, command, implicit] = await Promise.all([
    runFromPipe('execute.ts', { args: ['output', '--version'] }),
    runFromPipe('execute.ts', { args: ['output', '--help'] }),
    runFromPipe('execute.ts', { args: ['output', 'run', '--help'] }),
    runFromPipe('execute.ts', { args: ['output'] }),
  ]);

  for (const result of [version, topLevel, command, implicit]) {
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).not.toContain('executed');
  }
  expect(version.stdout).toBe('1.2.3\ncontinued\n');
  expect(topLevel.stdout).toContain('Commands:');
  expect(topLevel.stdout).toContain('Flags:');
  expect(command.stdout).toStartWith('Usage: tool run [flags]');
  expect(implicit.stdout).not.toContain('Flags:');
});

test('错误输出与退出码', async () => {
  const plain = await runFromPipe('execute.ts', {
    args: ['error', '--unknown'],
  });
  const colored = await runFromPipe('execute.ts', {
    args: ['error', '--unknown'],
    env: getColorEnv(),
  });

  for (const result of [plain, colored]) {
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
  }
  expect(plain.stderr).toBe("error: Unknown option '--unknown'\n");
  expect(colored.stderr).toStartWith('\x1b[0m\x1b[31merror');
});

test.each([
  ['数字短名', 'short'],
  ['字符串别名', 'aliases'],
])('配置异常：%s', async (_label, scenario) => {
  const result = await runFromPipe('execute.ts', {
    args: [scenario, 'run'],
  });

  expect(result.exitCode).toBe(0);
  expect(result.stdout).toBe('caught TypeError\ncontinued\n');
  expect(result.stderr).toBe('');
});
