import { setProgramOptions } from '#src/internal/metadata';
import { type TextStyle } from '#src/utils/terminal';

type CommandConstructor = new (...positionals: string[]) => object;

export type ProgramConstructor = abstract new (
  ...constructorArguments: never[]
) => object;

export interface ProgramOptions {
  name?: string;
  description?: string;
  version?: string;
  commands?: readonly CommandConstructor[];
  categories?: Readonly<Record<string, TextStyle | readonly TextStyle[]>>;
  details?: Readonly<Record<string, string>>;
}

export function Program(options: ProgramOptions = {}) {
  return (
    _target: ProgramConstructor,
    context: ClassDecoratorContext<ProgramConstructor>,
  ) => {
    setProgramOptions(context, options);
  };
}
