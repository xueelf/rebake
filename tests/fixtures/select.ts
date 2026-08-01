import { select } from '#src/prompts/select';
import { colorize } from '#src/utils/terminal';

const result = select('Select a project template', [
  { label: colorize('yellow', 'Blank'), value: 'blank' },
  { label: colorize('cyan', 'React'), value: 'react' },
  { label: colorize('blue', 'Library'), value: 'library' },
]);

process.stdout.write(`RESULT=${result?.value ?? 'null'}\n`);
