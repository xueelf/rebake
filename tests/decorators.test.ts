import { expect, expectTypeOf, test } from 'bun:test';

import { type CommandExample, Command, Option, Program } from '#src/index';
import {
  getCommandOptions,
  getOptionRegistry,
  getProgramOptions,
} from '#src/internal/metadata';

test('元数据注册', () => {
  @Command({
    name: 'start',
    description: 'Start the server',
  })
  class StartCommand {
    @Option({ short: 'p', description: 'Port to bind' })
    static port = '3000';

    @Option({ description: 'Enable verbose logging' })
    static verbose = false;
  }

  @Program({
    name: 'test-cli',
    version: '1.0.0',
    commands: [StartCommand],
  })
  class TestProgram {}

  expect(getProgramOptions(TestProgram)).toEqual({
    name: 'test-cli',
    version: '1.0.0',
    commands: [StartCommand],
  });
  expect(getCommandOptions(StartCommand)).toEqual({
    name: 'start',
    description: 'Start the server',
  });
  expect([...getOptionRegistry(StartCommand)!]).toEqual([
    [
      'port',
      {
        short: 'p',
        description: 'Port to bind',
        type: 'string',
        defaultValue: '3000',
      },
    ],
    [
      'verbose',
      {
        description: 'Enable verbose logging',
        type: 'boolean',
        defaultValue: false,
      },
    ],
  ]);
});

test('选项继承与覆盖', () => {
  @Command('base')
  class BaseCommand {
    @Option()
    static base = false;

    @Option()
    static mode = 'base';
  }

  @Command('child')
  class ChildCommand extends BaseCommand {
    @Option()
    static child = false;

    @Option()
    static override mode = 'child';
  }

  expect([...getOptionRegistry(BaseCommand)!.keys()]).toEqual(['base', 'mode']);
  expect([...getOptionRegistry(ChildCommand)!.keys()]).toEqual([
    'base',
    'mode',
    'child',
  ]);
  expect(getOptionRegistry(BaseCommand)?.get('mode')?.defaultValue).toBe(
    'base',
  );
  expect(getOptionRegistry(ChildCommand)?.get('mode')?.defaultValue).toBe(
    'child',
  );
  expect(getCommandOptions(BaseCommand)?.name).toBe('base');
  expect(getCommandOptions(ChildCommand)?.name).toBe('child');
});

test('独立选项基类', () => {
  class BaseOptions {
    @Option()
    static inherited = false;
  }

  @Command('child')
  class ChildCommand extends BaseOptions {}

  expect(getOptionRegistry(ChildCommand)?.has('inherited')).toBeTrue();
});

test('Symbol.metadata 变更', () => {
  if (Symbol.metadata !== undefined) {
    return;
  }
  const metadataDescriptor = Reflect.getOwnPropertyDescriptor(
    Symbol,
    'metadata',
  );

  try {
    Reflect.defineProperty(Symbol, 'metadata', {
      configurable: true,
      value: Symbol('late Symbol.metadata'),
    });

    @Command('late-command')
    class LateCommand {
      @Option()
      static verbose = false;
    }

    @Program({
      name: 'late-metadata',
      commands: [LateCommand],
    })
    class Application {}

    expect(getProgramOptions(Application)?.name).toBe('late-metadata');
    expect(getCommandOptions(LateCommand)?.name).toBe('late-command');
    expect(getOptionRegistry(LateCommand)?.has('verbose')).toBeTrue();
  } finally {
    if (metadataDescriptor) {
      Reflect.defineProperty(Symbol, 'metadata', metadataDescriptor);
    } else {
      Reflect.deleteProperty(Symbol, 'metadata');
    }
  }
});

test('类替换', () => {
  function replaceClass<Class extends new () => object>(target: Class): Class {
    return new Proxy(target, {});
  }

  @replaceClass
  @Command('replaced')
  class ReplacedCommand {
    @Option()
    static verbose = false;
  }

  expect(getCommandOptions(ReplacedCommand)?.name).toBe('replaced');
  expect(getOptionRegistry(ReplacedCommand)?.has('verbose')).toBeTrue();
});

test('选项基类替换', () => {
  function replaceClass<Class extends new () => object>(target: Class): Class {
    return new Proxy(target, {});
  }

  @replaceClass
  class BaseOptions {
    @Option()
    static verbose = false;
  }

  @Command('child')
  class ChildCommand extends BaseOptions {}

  expect(
    getOptionRegistry(BaseOptions)?.get('verbose')?.defaultValue,
  ).toBeFalse();
  expect(
    getOptionRegistry(ChildCommand)?.get('verbose')?.defaultValue,
  ).toBeFalse();
});

test('字段装饰器目标', () => {
  expect(() => {
    class StaticMethod {
      // @ts-expect-error JavaScript 调用方也必须在装饰阶段被拒绝。
      @Option()
      static value() {
        return true;
      }
    }

    return StaticMethod;
  }).toThrow('can only be used on fields');

  expect(() => {
    class StaticGetter {
      // @ts-expect-error getter 不是可注册的静态字段。
      @Option()
      static get value() {
        return true;
      }
    }

    return StaticGetter;
  }).toThrow('can only be used on fields');

  expect(() => {
    class StaticAccessor {
      // @ts-expect-error 自动访问器具有独立的装饰器契约。
      @Option()
      static accessor value = true;
    }

    return StaticAccessor;
  }).toThrow('can only be used on fields');
});

test.each([
  ['空值', 'null'],
  ['布尔值', 'false'],
  ['数字', '1'],
  ['数组', '[]'],
  ['字符串', '"options"'],
])('配置容器：%s', (_label, json) => {
  expect(() => Option(JSON.parse(json))).toThrow(TypeError);
  expect(() => Program(JSON.parse(json))).toThrow(TypeError);

  if (json !== '"options"') {
    expect(() => Command(JSON.parse(json))).toThrow(TypeError);
  }
});

test.each([
  ['数字短名', '{"short":1}'],
  ['空短名', '{"short":null}'],
  ['描述类型', '{"description":false}'],
])('选项配置：%s', (_label, json) => {
  expect(() => Option(JSON.parse(json))).toThrow(TypeError);
});

test('选项字段与初始值', () => {
  expect(() => {
    class InstanceField {
      @Option()
      value = 'bad';
    }

    return InstanceField;
  }).toThrow('can only be used on static properties');

  expect(() => {
    class PrivateField {
      @Option()
      static #value = 'bad';

      static read(): string {
        return this.#value;
      }
    }

    return PrivateField;
  }).toThrow('cannot be used on private properties');

  expect(() => {
    const key = Symbol('option');

    class SymbolField {
      @Option()
      static [key] = 'bad';
    }

    return SymbolField;
  }).toThrow('cannot be used on symbol properties');

  expect(() => {
    class InvalidValue {
      @Option()
      static value = 1 as unknown as string;
    }

    return InvalidValue;
  }).toThrow('must be initialized with a boolean or string');
});

test('短名约束', () => {
  expect(() => Option({ short: 'long' })).toThrow(
    'must be one alphanumeric character',
  );
  expect(() => Option({ short: 'h' })).toThrow(
    'cannot use the reserved short name "h"',
  );
});

test('__proto__ 字段', () => {
  expect(() => {
    class PrototypeOption {
      @Option()
      static ['__proto__'] = false;
    }

    return PrototypeOption;
  }).toThrow('cannot be named "__proto__"');
});

test('构造函数与示例类型', () => {
  const validExample: CommandExample = {
    syntax: 'tool valid value',
  };

  // @ts-expect-error 示例必须显式提供完整命令，不能从 args 或命令名推断。
  const invalidExample: CommandExample = {};

  @Command('valid')
  class ValidCommand {
    constructor(_value: string, _optional?: string) {}
  }

  // @ts-expect-error 命令构造函数只能接收终端传入的字符串位置参数。
  @Command('invalid')
  class InvalidCommand {
    constructor(_value: number) {}
  }

  // @ts-expect-error 命令构造函数必须接受任意终端字符串，不能收窄为字面量。
  @Command('narrow')
  class NarrowCommand {
    constructor(_value: 'only') {}
  }

  class InvalidProgramCommand {
    constructor(_value: number) {}
  }

  @Program({
    // @ts-expect-error Program 只能注册可接收终端字符串参数的命令类。
    commands: [InvalidProgramCommand],
  })
  class InvalidProgram {}

  // @ts-expect-error 命令会在执行时实例化，因此不能声明为抽象类。
  @Command('abstract')
  abstract class AbstractCommand {}

  expectTypeOf<
    ConstructorParameters<typeof ValidCommand>[0]
  >().toEqualTypeOf<string>();
  expectTypeOf<ConstructorParameters<typeof ValidCommand>[1]>().toEqualTypeOf<
    string | undefined
  >();
  expectTypeOf<
    ConstructorParameters<typeof ValidCommand>['length']
  >().toEqualTypeOf<1 | 2>();
  expectTypeOf(validExample).toMatchTypeOf<CommandExample>();

  void [
    invalidExample,
    ValidCommand,
    InvalidCommand,
    NarrowCommand,
    InvalidProgram,
    AbstractCommand,
  ];
});
