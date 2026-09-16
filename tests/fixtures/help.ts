import { Command, execute, Option, Program } from '#src/index';

@Command('run')
class RunCommand {
  @Option({ description: 'English description' })
  static english = false;

  @Option({ description: 'Chinese description' })
  static ['中'] = false;

  @Option({ description: 'String description' })
  static ['文'] = '';
}

@Program({ name: 'tool', commands: [RunCommand] })
class Application {}

execute(Application, ['run', '--help']);
