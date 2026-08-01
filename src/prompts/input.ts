import { readStdinByteOrEof } from '#src/internal/stdin';
import { enterInputMode } from '#src/internal/terminal-mode';
import { SPACE, styleCliText, writeStdout } from '#src/utils/terminal';

const textDecoder = new TextDecoder();

export interface InputOptions {
  default?: string;
}

function readInputLine(): string | null {
  const inputBytes: number[] = [];

  while (true) {
    const inputByte = readStdinByteOrEof();

    if (inputByte === -1) {
      return null;
    }

    if (inputByte === 10) {
      break;
    }
    inputBytes.push(inputByte);
  }

  if (inputBytes.at(-1) === 13) {
    inputBytes.pop();
  }
  return textDecoder.decode(Uint8Array.from(inputBytes));
}

export function input(
  message: string,
  options: InputOptions = {},
): string | null {
  const defaultValue = options.default;

  if (message.length > 0) {
    const hasVisibleDefault =
      defaultValue !== undefined && defaultValue.length > 0;
    const suffix = hasVisibleDefault ? `(${defaultValue}):` : ':';

    writeStdout(
      styleCliText('cyan', message),
      hasVisibleDefault ? SPACE : '',
      styleCliText('dim', suffix),
    );
  }
  writeStdout(SPACE);

  const restoreInputMode = enterInputMode();
  let result: string | null;

  try {
    result = readInputLine();
  } finally {
    restoreInputMode?.();
  }

  if (result === null) {
    return null;
  }
  return result === '' ? (defaultValue ?? '') : result;
}
