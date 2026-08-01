import { type CommandOptions } from '#src/decorators/Command';
import { type OptionOptions, type OptionValue } from '#src/decorators/Option';
import { type ProgramOptions } from '#src/decorators/Program';

// 使用模块私有 Symbol，避免与其它装饰器库写入的元数据发生键名冲突。
const COMMAND_OPTIONS = Symbol('rebake.command-options');
const OPTION_REGISTRY = Symbol('rebake.option-registry');
const PROGRAM_OPTIONS = Symbol('rebake.program-options');

export interface RegisteredOption extends OptionOptions {
  type: 'boolean' | 'string';
  defaultValue: OptionValue;
}

export type OptionRegistry = ReadonlyMap<string, RegisteredOption>;

type RebakeMetadata = DecoratorMetadataObject & {
  [COMMAND_OPTIONS]?: CommandOptions;
  [OPTION_REGISTRY]?: Map<string, RegisteredOption>;
  [PROGRAM_OPTIONS]?: ProgramOptions;
};

const metadataByClass = new WeakMap<object, RebakeMetadata>();

function requireDecoratorMetadata(metadata: DecoratorMetadata): RebakeMetadata {
  if (!metadata) {
    throw new TypeError('Rebake requires Bun decorator metadata support.');
  }
  return metadata;
}

function getOwnMetadata(target: object): RebakeMetadata | undefined {
  return metadataByClass.get(target);
}

function bindClassMetadata(
  context: ClassDecoratorContext,
  metadata: RebakeMetadata,
): void {
  // 类装饰器初始化器中的 this 是其它装饰器完成替换后的最终类。
  context.addInitializer(function () {
    metadataByClass.set(this, metadata);
  });
}

export function bindOptionMetadata<This, Value>(
  context: ClassFieldDecoratorContext<This, Value>,
): void {
  const rebakeMetadata = requireDecoratorMetadata(context.metadata);

  context.addInitializer(function () {
    metadataByClass.set(this as object, rebakeMetadata);
  });
}

export function setProgramOptions(
  context: ClassDecoratorContext,
  options: ProgramOptions,
): void {
  const rebakeMetadata = requireDecoratorMetadata(context.metadata);

  rebakeMetadata[PROGRAM_OPTIONS] = options;
  bindClassMetadata(context, rebakeMetadata);
}

export function setCommandOptions(
  context: ClassDecoratorContext,
  options: CommandOptions,
): void {
  const rebakeMetadata = requireDecoratorMetadata(context.metadata);

  rebakeMetadata[COMMAND_OPTIONS] = options;
  bindClassMetadata(context, rebakeMetadata);
}

export function registerOption(
  metadata: DecoratorMetadata,
  name: string,
  option: RegisteredOption,
): void {
  const rebakeMetadata = requireDecoratorMetadata(metadata);
  const registeredOptions = Object.hasOwn(rebakeMetadata, OPTION_REGISTRY)
    ? rebakeMetadata[OPTION_REGISTRY]
    : undefined;
  const options = registeredOptions ?? new Map<string, RegisteredOption>();

  if (!registeredOptions) {
    rebakeMetadata[OPTION_REGISTRY] = options;
  }
  options.set(name, option);
}

export function getProgramOptions(target: object): ProgramOptions | undefined {
  const metadata = getOwnMetadata(target);

  return metadata && Object.hasOwn(metadata, PROGRAM_OPTIONS)
    ? metadata[PROGRAM_OPTIONS]
    : undefined;
}

export function getCommandOptions(target: object): CommandOptions | undefined {
  const metadata = getOwnMetadata(target);

  return metadata && Object.hasOwn(metadata, COMMAND_OPTIONS)
    ? metadata[COMMAND_OPTIONS]
    : undefined;
}

export function getOptionRegistry(target: object): OptionRegistry | undefined {
  const registries: Map<string, RegisteredOption>[] = [];
  let currentTarget: object | null = target;

  while (currentTarget && currentTarget !== Function.prototype) {
    const metadata = getOwnMetadata(currentTarget);
    const options =
      metadata && Object.hasOwn(metadata, OPTION_REGISTRY)
        ? metadata[OPTION_REGISTRY]
        : undefined;

    if (options) {
      registries.unshift(options);
    }
    currentTarget = Reflect.getPrototypeOf(currentTarget);
  }

  if (registries.length === 0) {
    return undefined;
  }
  // 从父类到子类依次覆盖，使子类同名选项拥有最终优先级。
  const mergedOptions = new Map<string, RegisteredOption>();

  for (const options of registries) {
    for (const [name, option] of options) {
      mergedOptions.set(name, option);
    }
  }

  return mergedOptions;
}
