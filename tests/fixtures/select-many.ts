import { select } from '#src/prompts/select';

const choices = Array.from({ length: 8 }, (_, index) => ({
  label: `Choice ${index + 1}`,
  value: String(index + 1),
}));
const result = select('Choose', choices);

process.stdout.write(`RESULT=${result?.value ?? 'null'}\n`);
