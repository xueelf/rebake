import { select } from '#src/prompts/select';

const isTTYDescriptor = Reflect.getOwnPropertyDescriptor(
  process.stdin,
  'isTTY',
);
const isRawDescriptor = Reflect.getOwnPropertyDescriptor(
  process.stdin,
  'isRaw',
);
const setRawModeDescriptor = Reflect.getOwnPropertyDescriptor(
  process.stdin,
  'setRawMode',
);
const rawModes: boolean[] = [];
const values: string[] = [];
let enableCallCount = 0;
let errorMessage = '';

Reflect.defineProperty(process.stdin, 'isTTY', {
  configurable: true,
  value: true,
});
Reflect.defineProperty(process.stdin, 'isRaw', {
  configurable: true,
  value: true,
});
Reflect.defineProperty(process.stdin, 'setRawMode', {
  configurable: true,
  value(enabled: boolean) {
    rawModes.push(enabled);

    if (enabled) {
      enableCallCount += 1;

      if (enableCallCount === 1) {
        throw new Error('enable failed');
      }
    } else {
      throw new Error('restore failed');
    }
  },
});

try {
  const first = select('First', [{ value: 'first' }]);
  const second = select('Second', [{ value: 'second' }]);

  if (first) {
    values.push(first.value);
  }

  if (second) {
    values.push(second.value);
  }
} catch (error) {
  errorMessage = error instanceof Error ? error.message : String(error);
} finally {
  if (isTTYDescriptor) {
    Reflect.defineProperty(process.stdin, 'isTTY', isTTYDescriptor);
  } else {
    Reflect.deleteProperty(process.stdin, 'isTTY');
  }

  if (isRawDescriptor) {
    Reflect.defineProperty(process.stdin, 'isRaw', isRawDescriptor);
  } else {
    Reflect.deleteProperty(process.stdin, 'isRaw');
  }

  if (setRawModeDescriptor) {
    Reflect.defineProperty(process.stdin, 'setRawMode', setRawModeDescriptor);
  } else {
    Reflect.deleteProperty(process.stdin, 'setRawMode');
  }
}
process.stdout.write(
  `RESULT=${JSON.stringify({
    errorMessage,
    rawModes,
    values,
  })}\n`,
);
