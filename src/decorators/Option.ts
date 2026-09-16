import { registerOption } from '#src/internal/metadata';

export interface OptionOptions {
  description?: string;
  short?: string;
}

export type OptionValue = boolean | string;

export function Option(options: OptionOptions = {}) {
  if (
    typeof options !== 'object' ||
    options === null ||
    Array.isArray(options)
  ) {
    throw new TypeError('@Option() options must be an object.');
  }

  if (
    options.description !== undefined &&
    typeof options.description !== 'string'
  ) {
    throw new TypeError('@Option() description must be a string.');
  }

  if (
    options.short !== undefined &&
    (typeof options.short !== 'string' || !/^[A-Za-z0-9]$/.test(options.short))
  ) {
    throw new TypeError('@Option() short must be one alphanumeric character.');
  }

  if (options.short === 'h') {
    throw new TypeError('@Option() cannot use the reserved short name "h".');
  }
  return <This, Value extends OptionValue>(
    _target: undefined,
    context: ClassFieldDecoratorContext<This, Value>,
  ) => {
    if (context.kind !== 'field') {
      throw new TypeError('@Option() can only be used on fields.');
    }

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

    if (name === '__proto__') {
      throw new TypeError(
        '@Option() cannot be named "__proto__" because Bun does not create that static field.',
      );
    }
    context.addInitializer(function () {
      // 等待同一字段的所有值初始化器完成，避免登记其它装饰器转换前的中间值。
      const initialValue = context.access.get(this);

      if (
        typeof initialValue !== 'boolean' &&
        typeof initialValue !== 'string'
      ) {
        throw new TypeError(
          `@Option() property "${name}" must be initialized with a boolean or string.`,
        );
      }
      registerOption(this as object, context.metadata, name, {
        ...options,
        type: typeof initialValue === 'boolean' ? 'boolean' : 'string',
        defaultValue: initialValue,
      });
    });
  };
}
