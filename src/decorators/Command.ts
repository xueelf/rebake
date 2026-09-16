import { setCommandOptions } from '#src/internal/metadata';

type CommandDecoratorTarget = new (...positionals: string[]) => object;

export interface CommandExample {
  syntax: string;
  description?: string;
}

export interface CommandOptions {
  name: string;
  args?: string;
  description?: string;
  category?: string;
  aliases?: readonly string[];
  examples?: readonly CommandExample[];
  epilog?: readonly string[];
}

export function Command(options: CommandOptions | string) {
  if (
    typeof options !== 'string' &&
    (typeof options !== 'object' || options === null || Array.isArray(options))
  ) {
    throw new TypeError('@Command() options must be a string or object.');
  }
  const normalizedOptions: CommandOptions =
    typeof options === 'string' ? { name: options } : options;

  return (
    _target: CommandDecoratorTarget,
    context: ClassDecoratorContext<CommandDecoratorTarget>,
  ) => {
    setCommandOptions(context, normalizedOptions);
  };
}
