import { select } from '#src/prompts/select';

const result = select('Choose', [
  { value: 'disabled', disabled: true },
  { value: 'selected', selected: true },
  { value: 'other' },
]);

process.stdout.write(`RESULT=${result?.value ?? 'null'}\n`);
