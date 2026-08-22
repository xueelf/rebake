import { input } from '#src/prompts/input';
import { select } from '#src/prompts/select';

const name = input('Name');
const choice = select('Choice', [{ value: 'first' }, { value: 'second' }]);

process.stdout.write(
  `RESULT=${JSON.stringify({
    name,
    choice: choice?.value ?? null,
  })}\n`,
);
