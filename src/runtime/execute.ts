import { parseArgs } from 'node:util';

import { type CommandDefinition, createProgramDefinition } from './definition';
import { renderCommandHelp, renderTopLevelHelp } from './help';

import { type ProgramConstructor } from '#src/decorators/Program';
import { styleCliText } from '#src/utils/terminal';

type ParseOptionSpec = {
  type: 'boolean' | 'string';
  short?: string;
};

const GLOBAL_PARSE_OPTIONS = {
  help: { type: 'boolean', short: 'h' },
  version: { type: 'boolean', short: 'v' },
} as const;

function getCommandIndex(argv: readonly string[]): number {
  return argv.findIndex(arg => !arg.startsWith('-'));
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function exitWithError(message: string): never {
  console.error(
    `${styleCliText('red', 'error', process.stderr)}${styleCliText('dim', ':', process.stderr)} ${message}`,
  );
  process.exit(1);
}

function parseArgsOrExit(
  config: Parameters<typeof parseArgs>[0],
): ReturnType<typeof parseArgs> {
  try {
    return parseArgs(config);
  } catch (error: unknown) {
    exitWithError(toErrorMessage(error));
  }
}

function buildParseOptions(
  command: CommandDefinition,
): Record<string, ParseOptionSpec> {
  // Bun 的 parseArgs 使用无原型结果对象；配置对象也保持相同结构以避开特殊属性。
  const parseOptions = Object.create(null) as Record<string, ParseOptionSpec>;

  parseOptions['help'] = { type: 'boolean', short: 'h' };

  for (const [name, option] of command.optionRegistry) {
    parseOptions[name] = option.short
      ? { type: option.type, short: option.short }
      : { type: option.type };

    if (option.type === 'boolean' && option.defaultValue === true) {
      parseOptions[`no-${name}`] = { type: 'boolean' };
    }
  }

  return parseOptions;
}

function resetCommandOptions(command: CommandDefinition): void {
  // execute 可以在同一进程中重复调用，每次都必须从装饰器记录的默认值开始。
  for (const [name, option] of command.optionRegistry) {
    if (!Reflect.set(command.commandClass, name, option.defaultValue)) {
      throw new TypeError(
        `Cannot reset option "${name}" on command "${command.commandOptions.name}".`,
      );
    }
  }
}

function applyParsedOptions(
  command: CommandDefinition,
  values: ReturnType<typeof parseArgs>['values'],
): void {
  // 先完成互斥校验，避免用户输入错误重置上一次成功执行留下的状态。
  for (const [name, option] of command.optionRegistry) {
    const hasConflictingValues =
      values[name] === true &&
      option.type === 'boolean' &&
      option.defaultValue === true &&
      values[`no-${name}`] === true;

    if (hasConflictingValues) {
      exitWithError(
        `Options "--${name}" and "--no-${name}" cannot be used together.`,
      );
    }
  }
  resetCommandOptions(command);

  for (const [name, option] of command.optionRegistry) {
    const value = values[name];
    const isNegated =
      option.type === 'boolean' &&
      option.defaultValue === true &&
      values[`no-${name}`] === true;
    const appliedValue = isNegated ? false : value;

    if (
      (typeof appliedValue === 'boolean' || typeof appliedValue === 'string') &&
      !Reflect.set(command.commandClass, name, appliedValue)
    ) {
      throw new TypeError(
        `Cannot set option "${name}" on command "${command.commandOptions.name}".`,
      );
    }
  }
}

export function execute(
  ProgramClass: ProgramConstructor,
  argv: readonly string[] = process.argv.slice(2),
): void {
  const program = createProgramDefinition(ProgramClass);
  const commandIndex = getCommandIndex(argv);
  const globalArgs = commandIndex === -1 ? argv : argv.slice(0, commandIndex);
  const parsedGlobalArgs = parseArgsOrExit({
    args: globalArgs,
    options: GLOBAL_PARSE_OPTIONS,
    strict: true,
    allowPositionals: false,
    allowNegative: false,
  });
  const globalValues = parsedGlobalArgs.values;

  if (globalValues['help'] === true) {
    console.log(renderTopLevelHelp(program, true));
    return;
  }

  if (globalValues['version'] === true) {
    console.log(program.programOptions.version ?? '0.0.0');
    return;
  }

  if (commandIndex === -1) {
    console.log(renderTopLevelHelp(program));
    return;
  }
  const commandToken = argv[commandIndex];

  const command = commandToken
    ? program.commandLookup.get(commandToken)
    : undefined;

  if (!command) {
    exitWithError(
      `Command "${commandToken ?? ''}" not found. Run "${program.executableName} --help" to see available commands.`,
    );
  }
  const parsedArgs = parseArgsOrExit({
    args: argv.slice(commandIndex + 1),
    options: buildParseOptions(command),
    strict: true,
    allowPositionals: true,
    allowNegative: false,
  });

  if (parsedArgs.values['help'] === true) {
    console.log(renderCommandHelp(program, command));
    return;
  }
  applyParsedOptions(command, parsedArgs.values);
  Reflect.construct(command.commandClass, parsedArgs.positionals);
}
