import { Command, execute, Program } from '#src/index';

@Command('run')
class RunCommand {}

@Program({ name: 'tool', commands: [RunCommand] })
class Application {}

execute(Application, ['--unknown']);
