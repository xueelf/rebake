import { input } from '#src/prompts/input';
import { select } from '#src/prompts/select';

const choice = select('Choice', [{ value: 'first' }, { value: 'second' }]);
const name = input('Name');

process.stdout.write(
  `RESULT=${JSON.stringify({
    choice: choice?.value ?? null,
    name,
  })}\n`,
);
