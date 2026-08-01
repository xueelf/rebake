import { setCommandOptions } from '#src/internal/metadata';

type CommandDecoratorTarget = new (...positionals: string[]) => object;

export interface CommandExample {
  syntax?: string;
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
  const normalizedOptions: CommandOptions =
    typeof options === 'string' ? { name: options } : options;

  return (
    _target: CommandDecoratorTarget,
    context: ClassDecoratorContext<CommandDecoratorTarget>,
  ) => {
    setCommandOptions(context, normalizedOptions);
  };
}
