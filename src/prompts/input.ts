import { readStdinByteOrEof } from '#src/internal/stdin';
import { enterInputMode } from '#src/internal/terminal-mode';
import { SPACE, styleCliText, writeStdout } from '#src/utils/terminal';

const textDecoder = new TextDecoder();
const INPUT_BUFFER_SIZE = 1024;

export interface InputOptions {
  default?: string;
}

function readInputLine(): string | null {
  const inputBytes: number[] = [];

  while (true) {
    // Bun 在读取下一字节前检查缓冲区，因此正文最多为 1023 字节，LF 占用最后一次读取。
    if (inputBytes.length >= INPUT_BUFFER_SIZE) {
      throw new RangeError('Input cannot exceed 1023 bytes.');
    }
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
  if (typeof message !== 'string') {
    throw new TypeError('Input message must be a string.');
  }

  if (
    typeof options !== 'object' ||
    options === null ||
    Array.isArray(options)
  ) {
    throw new TypeError('Input options must be an object.');
  }
  const defaultValue = options.default;

  if (defaultValue !== undefined && typeof defaultValue !== 'string') {
    throw new TypeError('Input default value must be a string.');
  }

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
