import { closeSync } from 'node:fs';

import { type InputOptions, input } from '#src/prompts/input';
import { select } from '#src/prompts/select';

const lowercaseOptions: InputOptions = {
  default: 'rebake',
  validate: value =>
    /^[a-z]+$/.test(value) || 'Only lowercase letters are allowed.',
};

function validatedInput(message: string, options: InputOptions) {
  const result = input(message, options);

  process.stdout.write(`RAW=${process.stdin.isRaw}\n`);
  return result;
}

function runScenario() {
  switch (process.argv[2] ?? 'default') {
    case 'default':
      return input('package name', { default: 'rebake' });

    case 'validate':
      return validatedInput('package name', lowercaseOptions);

    case 'validate-next': {
      const first = input('first value', lowercaseOptions);
      const second = input('second value', { default: 'fallback' });

      return { first, second };
    }

    case 'inline':
      process.stdout.write('prefix ');
      return input('name', {
        validate: value => value === 'ok' || 'Enter ok.',
      });

    case 'screen':
      // 从终端底部开始交互，让首次提交和错误显示都实际触发滚屏。
      process.stdout.write('\n'.repeat(40));
      return validatedInput('name', {
        validate: value => value === 'ok' || 'Enter ok.',
      });

    case 'long':
      process.stdout.write('\n'.repeat(40));
      return validatedInput('name', {
        validate: value => !value.endsWith('!') || 'Enter a value without !.',
      });

    case 'read-error':
      closeSync(process.stdin.fd);
      return input('Value');

    case 'then-select': {
      const name = input('Name');
      const choice = select('Choice', [
        { value: 'first' },
        { value: 'second' },
      ]);

      return { name, choice: choice?.value ?? null };
    }

    default:
      throw new Error(`Unknown input scenario: ${process.argv[2]}`);
  }
}

const result = runScenario();
const output =
  typeof result === 'object' && result !== null
    ? JSON.stringify(result)
    : (result ?? 'null');

process.stdout.write(`RESULT=${output}\n`);
