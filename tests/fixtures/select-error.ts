import { select } from '#src/prompts/select';
import { ANSI } from '#src/utils/terminal';

const originalIsTTY = process.stdin.isTTY;
const originalSetRawMode = process.stdin.setRawMode;
const originalWrite = process.stdout.write;
const writes: string[] = [];
const rawModes: boolean[] = [];

process.env['FORCE_COLOR'] = '1';
Object.defineProperty(process.stdin, 'isTTY', {
  configurable: true,
  value: true,
});
Object.defineProperty(process.stdin, 'setRawMode', {
  configurable: true,
  value(enabled: boolean) {
    rawModes.push(enabled);
  },
});
process.stdout.write = ((chunk: string | Uint8Array) => {
  const text = String(chunk);

  writes.push(text);

  if (text === `${ANSI.CURSOR_UP(2)}${ANSI.ERASE_DOWN}`) {
    throw new Error('simulated final render failure');
  }
  return originalWrite.call(process.stdout, chunk);
}) as typeof process.stdout.write;

let errorMessage = '';

try {
  select('Choose', [{ value: 'first' }]);
} catch (error) {
  errorMessage = error instanceof Error ? error.message : String(error);
} finally {
  process.stdout.write = originalWrite;
  Object.defineProperty(process.stdin, 'isTTY', {
    configurable: true,
    value: originalIsTTY,
  });
  Object.defineProperty(process.stdin, 'setRawMode', {
    configurable: true,
    value: originalSetRawMode,
  });
}
console.log(
  `RESULT=${JSON.stringify({
    cursorRestored: writes.includes(ANSI.CURSOR_SHOW),
    errorMessage,
    rawModes,
  })}`,
);
