import { input } from '#src/prompts/input';

const result = input('package name', {
  default: 'rebake',
  validate: value =>
    /^[a-z]+$/.test(value) || 'Only lowercase letters are allowed.',
});

process.stdout.write(`RAW=${process.stdin.isRaw}\n`);
process.stdout.write(`RESULT=${result ?? 'null'}\n`);
