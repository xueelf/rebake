import { bindOptionMetadata, registerOption } from '#src/internal/metadata';

export interface OptionOptions {
  description?: string;
  short?: string;
}

export type OptionValue = boolean | string;

export function Option(options: OptionOptions = {}) {
  if (options.short !== undefined && !/^[A-Za-z0-9]$/.test(options.short)) {
    throw new TypeError('@Option() short must be one alphanumeric character.');
  }

  if (options.short === 'h') {
    throw new TypeError('@Option() cannot use the reserved short name "h".');
  }
  return <This, Value extends OptionValue>(
    _target: undefined,
    context: ClassFieldDecoratorContext<This, Value>,
  ) => {
    if (!context.static) {
      throw new TypeError(
        `@Option() can only be used on static properties. Property "${String(context.name)}" is not static.`,
      );
    }

    if (context.private) {
      throw new TypeError('@Option() cannot be used on private properties.');
    }

    if (typeof context.name !== 'string') {
      throw new TypeError('@Option() cannot be used on symbol properties.');
    }
    const name = context.name;

    if (name === 'help') {
      throw new TypeError(
        '@Option() cannot use the reserved property name "help".',
      );
    }
    bindOptionMetadata(context);

    return (initialValue: Value): Value => {
      if (
        typeof initialValue !== 'boolean' &&
        typeof initialValue !== 'string'
      ) {
        throw new TypeError(
          `@Option() property "${name}" must be initialized with a boolean or string.`,
        );
      }
      // 装饰器只能在字段初始化时可靠取得值类型和默认值。
      registerOption(context.metadata, name, {
        ...options,
        type: typeof initialValue === 'boolean' ? 'boolean' : 'string',
        defaultValue: initialValue,
      });

      return initialValue;
    };
  };
}
