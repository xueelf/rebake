import { closeSync } from 'node:fs';

import { input } from '#src/prompts/input';

closeSync(process.stdin.fd);
input('Value');
