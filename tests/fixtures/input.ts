import { input } from '#src/prompts/input';

const result = input('package name', { default: 'rebake' });

process.stdout.write(`RESULT=${result ?? 'null'}\n`);
