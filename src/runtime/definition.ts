import { type CommandOptions } from '#src/decorators/Command';
import {
  type ProgramConstructor,
  type ProgramOptions,
} from '#src/decorators/Program';
import {
  type OptionRegistry,
  getCommandOptions,
  getOptionRegistry,
  getProgramOptions,
} from '#src/internal/metadata';
import { validateTextStyle } from '#src/utils/terminal';

type CommandConstructor = NonNullable<ProgramOptions['commands']>[number];

export interface CommandDefinition {
  commandClass: CommandConstructor;
  commandOptions: CommandOptions;
  aliases: readonly string[];
  optionRegistry: OptionRegistry;
}

export interface ProgramDefinition {
  programOptions: ProgramOptions;
  executableName: string;
  commands: readonly CommandDefinition[];
  commandLookup: ReadonlyMap<string, CommandDefinition>;
}

function assertName(kind: string, name: unknown): void {
  if (typeof name !== 'string') {
    throw new TypeError(`${kind} name must be a string.`);
  }

  if (name.length === 0) {
    throw new TypeError(`${kind} name cannot be empty.`);
  }

  if (name.startsWith('-') || /[\s\p{Cc}]/u.test(name)) {
    throw new TypeError(
      `${kind} name "${name}" cannot start with "-" or contain whitespace or control characters.`,
    );
  }
}

function assertOptionName(commandName: string, optionName: string): void {
  assertName(`Option on command "${commandName}"`, optionName);

  if (optionName.includes('=')) {
    throw new TypeError(
      `Option on command "${commandName}" cannot contain "=" because Bun splits long options at the first equals sign.`,
    );
  }

  if (optionName.startsWith('no-')) {
    throw new TypeError(
      `Option on command "${commandName}" cannot start with "no-" because Bun reserves that prefix for negated boolean options.`,
    );
  }
}

function validateOptions(
  commandName: string,
  optionRegistry: OptionRegistry,
): void {
  const shortNames = new Set<string>();

  for (const [optionName, option] of optionRegistry) {
    assertOptionName(commandName, optionName);

    if (option.short === undefined) {
      continue;
    }

    if (shortNames.has(option.short)) {
      throw new TypeError(
        `Command "${commandName}" declares the short option "${option.short}" more than once.`,
      );
    }
    shortNames.add(option.short);
  }
}

function validateProgramOptions(options: ProgramOptions): void {
  for (const key of ['name', 'description', 'version'] as const) {
    if (options[key] !== undefined && typeof options[key] !== 'string') {
      throw new TypeError(`@Program() ${key} must be a string.`);
    }
  }

  if (options.commands !== undefined && !Array.isArray(options.commands)) {
    throw new TypeError(
      '@Program() commands must be an array of command classes.',
    );
  }

  for (const key of ['categories', 'details'] as const) {
    const value = options[key];

    if (
      value !== undefined &&
      (typeof value !== 'object' || value === null || Array.isArray(value))
    ) {
      throw new TypeError(`@Program() ${key} must be an object.`);
    }
  }

  for (const value of Object.values(options.details ?? {})) {
    if (typeof value !== 'string') {
      throw new TypeError('@Program() details values must be strings.');
    }
  }
  // 分类配置属于程序定义，不能等到彩色帮助渲染时才暴露非法值。
  for (const style of Object.values(options.categories ?? {})) {
    validateTextStyle(style);
  }
}

function validateCommandOptions(options: CommandOptions): void {
  assertName('Command', options.name);

  for (const key of ['args', 'description', 'category'] as const) {
    if (options[key] !== undefined && typeof options[key] !== 'string') {
      throw new TypeError(`@Command() ${key} must be a string.`);
    }
  }

  for (const key of ['aliases', 'examples', 'epilog'] as const) {
    if (options[key] !== undefined && !Array.isArray(options[key])) {
      throw new TypeError(`@Command() ${key} must be an array.`);
    }
  }

  for (const line of options.epilog ?? []) {
    if (typeof line !== 'string') {
      throw new TypeError('@Command() epilog entries must be strings.');
    }
  }

  for (const example of options.examples ?? []) {
    if (
      typeof example !== 'object' ||
      example === null ||
      Array.isArray(example)
    ) {
      throw new TypeError('@Command() examples entries must be objects.');
    }

    if (typeof example.syntax !== 'string') {
      throw new TypeError('@Command() example syntax must be a string.');
    }

    if (
      example.description !== undefined &&
      typeof example.description !== 'string'
    ) {
      throw new TypeError('@Command() example description must be a string.');
    }

    if (example.syntax.trim().length === 0) {
      throw new TypeError(
        `Example syntax for command "${options.name}" cannot be empty.`,
      );
    }
  }
}

export function createProgramDefinition(
  ProgramClass: ProgramConstructor,
): ProgramDefinition {
  const programOptions = getProgramOptions(ProgramClass);

  if (!programOptions) {
    throw new TypeError(
      `Class "${ProgramClass.name}" must be decorated with @Program().`,
    );
  }
  validateProgramOptions(programOptions);

  const executableName =
    programOptions.name ??
    (ProgramClass.name.length > 0 ? ProgramClass.name : 'cli');

  assertName('Program', executableName);

  const commands: CommandDefinition[] = [];
  const commandLookup = new Map<string, CommandDefinition>();

  for (const commandClass of programOptions.commands ?? []) {
    if (typeof commandClass !== 'function') {
      throw new TypeError(
        '@Program() commands entries must be command classes.',
      );
    }
    const commandOptions = getCommandOptions(commandClass);

    if (!commandOptions) {
      throw new TypeError(
        `Command class "${commandClass.name}" must be decorated with @Command().`,
      );
    }
    validateCommandOptions(commandOptions);

    const aliases = commandOptions.aliases ?? [];
    const optionRegistry = getOptionRegistry(commandClass) ?? new Map();

    validateOptions(commandOptions.name, optionRegistry);

    const definition: CommandDefinition = {
      commandClass,
      commandOptions,
      aliases,
      optionRegistry,
    };

    const existingCommand = commandLookup.get(commandOptions.name);

    if (existingCommand) {
      throw new TypeError(
        `Command name or alias "${commandOptions.name}" is shared by "${existingCommand.commandOptions.name}" and "${commandOptions.name}".`,
      );
    }
    commandLookup.set(commandOptions.name, definition);

    for (const alias of aliases) {
      assertName(`Alias for command "${commandOptions.name}"`, alias);

      const existingCommand = commandLookup.get(alias);
      if (existingCommand) {
        throw new TypeError(
          `Command name or alias "${alias}" is shared by "${existingCommand.commandOptions.name}" and "${commandOptions.name}".`,
        );
      }
      commandLookup.set(alias, definition);
    }
    commands.push(definition);
  }

  return {
    programOptions,
    executableName,
    commands,
    commandLookup,
  };
}
