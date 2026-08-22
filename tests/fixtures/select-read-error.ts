import { closeSync } from 'node:fs';

import { select } from '#src/prompts/select';

closeSync(process.stdin.fd);

const result = select('Choose', [{ value: 'first' }, { value: 'second' }]);

process.stdout.write(`RESULT=${result?.value ?? 'null'}\n`);
