import { expect, test } from 'bun:test';

import { Command, Option, Program } from '#src/index';
import { createProgramDefinition } from '#src/runtime/definition';

test('定义校验', () => {
  class MissingProgramDecorator {}

  expect(() => createProgramDefinition(MissingProgramDecorator)).toThrow(
    'must be decorated with @Program()',
  );

  class MissingCommandDecorator {}

  @Program({ commands: [MissingCommandDecorator] })
  class MissingCommandApplication {}

  expect(() => createProgramDefinition(MissingCommandApplication)).toThrow(
    'must be decorated with @Command()',
  );

  @Command(JSON.parse('{}'))
  class MissingCommandName {}

  @Program({ commands: [MissingCommandName] })
  class MissingCommandNameApplication {}

  expect(() => createProgramDefinition(MissingCommandNameApplication)).toThrow(
    'Command name must be a string.',
  );

  @Command(JSON.parse('{"name":1}'))
  class InvalidCommandName {}

  @Program({ commands: [InvalidCommandName] })
  class InvalidCommandNameApplication {}

  expect(() => createProgramDefinition(InvalidCommandNameApplication)).toThrow(
    'Command name must be a string.',
  );

  @Command({ name: 'first', aliases: ['shared'] })
  class FirstCommand {}

  @Command({ name: 'second', aliases: ['shared'] })
  class SecondCommand {}

  @Program({ commands: [FirstCommand, SecondCommand] })
  class DuplicateAliasApplication {}

  expect(() => createProgramDefinition(DuplicateAliasApplication)).toThrow(
    'Command name or alias "shared" is shared',
  );

  @Command({ name: 'empty-example', examples: [{ syntax: '  ' }] })
  class EmptyExampleCommand {}

  @Program({ commands: [EmptyExampleCommand] })
  class EmptyExampleApplication {}

  expect(() => createProgramDefinition(EmptyExampleApplication)).toThrow(
    'Example syntax for command "empty-example" cannot be empty.',
  );
});

test('重复短名', () => {
  @Command('run')
  class RunCommand {
    @Option({ short: 'x' })
    static first = false;

    @Option({ short: 'x' })
    static second = false;
  }

  @Program({ commands: [RunCommand] })
  class Application {}

  expect(() => createProgramDefinition(Application)).toThrow(
    'declares the short option "x" more than once',
  );
});

test('选项名称', () => {
  @Command('negative')
  class NegativeCommand {
    @Option()
    static ['no-cache'] = false;
  }

  @Program({ commands: [NegativeCommand] })
  class NegativeApplication {}

  expect(() => createProgramDefinition(NegativeApplication)).toThrow(
    'cannot start with "no-"',
  );

  @Command('equals')
  class EqualsCommand {
    @Option()
    static ['output=value'] = '';
  }

  @Program({ commands: [EqualsCommand] })
  class EqualsApplication {}

  expect(() => createProgramDefinition(EqualsApplication)).toThrow(
    'cannot contain "="',
  );

  @Command('control')
  class ControlCommand {
    @Option()
    static ['bad\u001b[31m'] = false;
  }

  @Program({ commands: [ControlCommand] })
  class ControlApplication {}

  expect(() => createProgramDefinition(ControlApplication)).toThrow(
    'contain whitespace or control characters',
  );
});

test.each([
  ['名称空值', '{"name":null}', 'name must be a string'],
  ['描述类型', '{"description":false}', 'description must be a string'],
  ['版本类型', '{"version":1}', 'version must be a string'],
  ['命令列表', '{"commands":{}}', 'commands must be an array'],
  [
    '命令类型',
    '{"commands":[null]}',
    'commands entries must be command classes',
  ],
  ['分类空值', '{"categories":null}', 'categories must be an object'],
  ['分类数组', '{"categories":[]}', 'categories must be an object'],
  ['附加信息类型', '{"details":"text"}', 'details must be an object'],
  [
    '附加信息值',
    '{"details":{"Docs":false}}',
    'details values must be strings',
  ],
])('程序配置：%s', (_label, json, message) => {
  @Program(JSON.parse(json))
  class Application {}

  expect(() => createProgramDefinition(Application)).toThrow(message);
});

test.each([
  ['参数概要', '{"name":"run","args":1}', 'args must be a string'],
  [
    '描述类型',
    '{"name":"run","description":false}',
    'description must be a string',
  ],
  ['分类类型', '{"name":"run","category":[]}', 'category must be a string'],
  ['别名列表', '{"name":"run","aliases":"go"}', 'aliases must be an array'],
  ['别名项', '{"name":"run","aliases":[1]}', 'name must be a string'],
  ['示例列表', '{"name":"run","examples":{}}', 'examples must be an array'],
  [
    '示例空值',
    '{"name":"run","examples":[null]}',
    'examples entries must be objects',
  ],
  [
    '示例命令',
    '{"name":"run","examples":[{"syntax":1}]}',
    'example syntax must be a string',
  ],
  [
    '示例描述',
    '{"name":"run","examples":[{"syntax":"tool run","description":false}]}',
    'example description must be a string',
  ],
  ['结语列表', '{"name":"run","epilog":"help"}', 'epilog must be an array'],
  ['结语项', '{"name":"run","epilog":[1]}', 'epilog entries must be strings'],
])('命令配置：%s', (_label, json, message) => {
  @Command(JSON.parse(json))
  class RunCommand {}

  @Program({ commands: [RunCommand] })
  class Application {}

  expect(() => createProgramDefinition(Application)).toThrow(message);
});
