import { describe, expect, test } from 'bun:test';

import { Command, Option, Program } from '#src/index';
import {
  getCommandOptions,
  getOptionRegistry,
  getProgramOptions,
} from '#src/internal/metadata';

describe('decorators', () => {
  test('registers program, command, and option metadata', () => {
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

  test('inherits options without mutating parent metadata', () => {
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

    expect([...getOptionRegistry(BaseCommand)!.keys()]).toEqual([
      'base',
      'mode',
    ]);
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

  test('inherits options from an undecorated base class', () => {
    class BaseOptions {
      @Option()
      static inherited = false;
    }

    @Command('child')
    class ChildCommand extends BaseOptions {}

    expect(getOptionRegistry(ChildCommand)?.has('inherited')).toBeTrue();
  });

  test('reads classes decorated after Symbol.metadata changes', () => {
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

  test('preserves metadata when another decorator replaces the class', () => {
    function replaceClass<Class extends new () => object>(
      target: Class,
    ): Class {
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

  test('rejects unsupported option targets and values', () => {
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

  test('rejects invalid and reserved short options', () => {
    expect(() => Option({ short: 'long' })).toThrow(
      'must be one alphanumeric character',
    );
    expect(() => Option({ short: 'h' })).toThrow(
      'cannot use the reserved short name "h"',
    );
  });
});
