import { Command, execute, Option, Program } from '#src/index';

const [scenario, ...args] = process.argv.slice(2);

if (scenario === 'error') {
  Object.defineProperty(process.stdout, 'isTTY', {
    configurable: true,
    value: false,
  });
  Object.defineProperty(process.stderr, 'isTTY', {
    configurable: true,
    value: true,
  });
}

try {
  @Command(
    scenario === 'aliases'
      ? JSON.parse('{"name":"run","aliases":"go"}')
      : 'run',
  )
  class RunCommand {
    @Option(scenario === 'short' ? JSON.parse('{"short":1}') : {})
    static verbose = false;

    constructor() {
      console.log('executed');
    }
  }

  @Program({ name: 'tool', version: '1.2.3', commands: [RunCommand] })
  class Application {}

  execute(Application, args);
} catch (error: unknown) {
  if (
    (scenario !== 'short' && scenario !== 'aliases') ||
    !(error instanceof TypeError)
  ) {
    throw error;
  }
  console.log('caught TypeError');
}
console.log('continued');
