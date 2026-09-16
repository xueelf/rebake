import { closeSync } from 'node:fs';

import { input } from '#src/prompts/input';
import { select } from '#src/prompts/select';
import { colorize } from '#src/utils/terminal';

function runScenario() {
  switch (process.argv[2] ?? 'default') {
    case 'default':
      return select('Select a project template', [
        { label: colorize('yellow', 'Blank'), value: 'blank' },
        { label: colorize('cyan', 'React'), value: 'react' },
        { label: colorize('blue', 'Library'), value: 'library' },
      ])?.value;

    case 'states':
      return select('Choose', [
        { value: 'disabled', disabled: true },
        { value: 'selected', selected: true },
        { value: 'other' },
      ])?.value;

    case 'many':
      return select(
        'Choose',
        Array.from({ length: 8 }, (_, index) => ({
          label: `Choice ${index + 1}`,
          value: String(index + 1),
        })),
      )?.value;

    case 'read-error':
      closeSync(process.stdin.fd);
      return select('Choose', [{ value: 'first' }, { value: 'second' }])?.value;

    case 'then-input': {
      const choice = select('Choice', [
        { value: 'first' },
        { value: 'second' },
      ]);
      const name = input('Name');

      return { choice: choice?.value ?? null, name };
    }

    default:
      throw new Error(`Unknown select scenario: ${process.argv[2]}`);
  }
}

const result = runScenario();
const output =
  typeof result === 'object' ? JSON.stringify(result) : (result ?? 'null');

process.stdout.write(`RESULT=${output}\n`);
