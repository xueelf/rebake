import { Command, execute, Program } from '#src/index';

Object.defineProperty(process.stdout, 'isTTY', {
  configurable: true,
  value: false,
});
Object.defineProperty(process.stderr, 'isTTY', {
  configurable: true,
  value: true,
});

@Command('run')
class RunCommand {}

@Program({ name: 'tool', commands: [RunCommand] })
class Application {}

execute(Application, ['--unknown']);
