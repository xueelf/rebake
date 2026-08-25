import {
  openNonBlockingStdinReader,
  preserveStdinByte,
  readStdinByteOrEof,
} from '#src/internal/stdin';
import {
  enterInputMode,
  enterValidatedInputMode,
} from '#src/internal/terminal-mode';
import { ANSI, SPACE, styleCliText, writeStdout } from '#src/utils/terminal';

const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();
const INPUT_BUFFER_SIZE = 1024;
const INVALID_INPUT_MESSAGE = 'Invalid input.';
const INPUT_INTERRUPTED = Symbol('input interrupted');

export interface InputOptions {
  default?: string;
  validate?: (value: string) => boolean | string;
}

function readInputCharacter(
  firstByte: number,
  readInputByte = readStdinByteOrEof,
): readonly [value: string, byteLength: number] | null {
  const byteCount =
    firstByte >= 0xc2 && firstByte <= 0xdf
      ? 2
      : firstByte >= 0xe0 && firstByte <= 0xef
        ? 3
        : firstByte >= 0xf0 && firstByte <= 0xf4
          ? 4
          : 1;
  const bytes = [firstByte];

  for (let index = 1; index < byteCount; index += 1) {
    const inputByte = readInputByte();

    if (inputByte === -1) {
      return null;
    }
    bytes.push(inputByte);
  }

  return [textDecoder.decode(Uint8Array.from(bytes)), byteCount];
}

function removeLastCharacters(value: string, characterCount: number): string {
  const characters = Array.from(value);

  return characters.slice(0, -characterCount).join('');
}

function getValidationError(
  validate: NonNullable<InputOptions['validate']>,
  value: string,
): string | undefined {
  const result = validate(value);

  if (result === true) {
    return undefined;
  }

  if (result === false || result === '') {
    return INVALID_INPUT_MESSAGE;
  }

  if (typeof result !== 'string') {
    throw new TypeError(
      'Input validator must return a boolean or error message string.',
    );
  }
  return result;
}

function renderCorrectedInput(value: string): void {
  writeStdout(ANSI.CURSOR_RESTORE, ANSI.ERASE_DOWN, value);
}

function renderValidationError(value: string, errorMessage: string): void {
  writeStdout(
    ANSI.CURSOR_RESTORE,
    ANSI.ERASE_DOWN,
    value,
    '\n',
    styleCliText('red', `> ${errorMessage}`),
    ANSI.CURSOR_RESTORE,
    value,
  );
}

function completeCorrectedInput(value: string): void {
  writeStdout(ANSI.CURSOR_RESTORE, ANSI.ERASE_DOWN, value, '\n');
}

function readCorrectedInput(
  initialValue: string,
  initialErrorMessage: string,
  defaultValue: string | undefined,
  validate: NonNullable<InputOptions['validate']>,
): string | null | typeof INPUT_INTERRUPTED {
  let value = initialValue;
  let valueByteLength = textEncoder.encode(value).length;
  let errorVisible = true;
  let pendingInputByte: number | undefined;
  const nonBlockingStdinReader = openNonBlockingStdinReader();
  const readInputByte = () => {
    if (pendingInputByte !== undefined) {
      const inputByte = pendingInputByte;

      pendingInputByte = undefined;
      return inputByte;
    }
    return readStdinByteOrEof();
  };

  try {
    renderValidationError(value, initialErrorMessage);

    while (true) {
      const inputByte = readInputByte();

      if (inputByte === -1 || inputByte === 4) {
        renderCorrectedInput(value);
        return null;
      }

      if (inputByte === 3) {
        completeCorrectedInput(value);
        return INPUT_INTERRUPTED;
      }

      if (inputByte === 10 || inputByte === 13) {
        const submittedValue = value === '' ? (defaultValue ?? '') : value;
        const errorMessage = getValidationError(validate, submittedValue);
        const followingInputByte =
          inputByte === 13 ? nonBlockingStdinReader?.readByte() : undefined;

        if (followingInputByte !== undefined && followingInputByte !== 10) {
          if (errorMessage === undefined) {
            // 非 LF 字节属于下一次 prompt，不能因探测 CRLF 而丢失。
            preserveStdinByte(followingInputByte);
          } else {
            pendingInputByte = followingInputByte;
          }
        }

        if (errorMessage === undefined) {
          completeCorrectedInput(value);
          return submittedValue;
        }
        renderValidationError(value, errorMessage);
        errorVisible = true;
        continue;
      }

      if (inputByte === 8 || inputByte === 127) {
        let characterCount = 1;
        let followingInputByte = nonBlockingStdinReader?.readByte();

        // 一次性处理已经排队的退格，避免长输入每删一字节都重绘整行。
        while (followingInputByte === 8 || followingInputByte === 127) {
          characterCount += 1;
          followingInputByte = nonBlockingStdinReader?.readByte();
        }

        pendingInputByte = followingInputByte;
        value = removeLastCharacters(value, characterCount);
        valueByteLength = textEncoder.encode(value).length;
        errorVisible = false;
        renderCorrectedInput(value);
        continue;
      }

      if (inputByte === 27) {
        completeCorrectedInput(value);
        return null;
      }

      if (inputByte !== 9 && inputByte < 32) {
        continue;
      }
      const character = readInputCharacter(inputByte, readInputByte);

      if (character === null) {
        renderCorrectedInput(value);
        return null;
      }
      const [text, byteLength] = character;

      if (valueByteLength + byteLength >= INPUT_BUFFER_SIZE) {
        throw new RangeError('Input cannot exceed 1023 bytes.');
      }

      if (errorVisible) {
        renderCorrectedInput(value);
        errorVisible = false;
      }
      value += text;
      valueByteLength += byteLength;
      writeStdout(text);
    }
  } catch (error: unknown) {
    completeCorrectedInput(value);
    throw error;
  } finally {
    nonBlockingStdinReader?.close();
  }
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

function writeInputPrompt(
  message: string,
  defaultValue: string | undefined,
): void {
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
  const validate = options.validate;

  if (validate !== undefined && typeof validate !== 'function') {
    throw new TypeError('Input validator must be a function.');
  }

  const canCorrectInput =
    validate !== undefined &&
    process.stdin.isTTY === true &&
    process.stdout.isTTY === true;

  writeInputPrompt(message, defaultValue);

  if (canCorrectInput) {
    writeStdout(ANSI.CURSOR_SAVE);
  }
  const restoreInitialInputMode = enterInputMode();
  let result: string | null;

  try {
    result = readInputLine();
  } finally {
    restoreInitialInputMode?.();
  }

  if (result === null) {
    return null;
  }
  const value = result === '' ? (defaultValue ?? '') : result;

  if (validate === undefined) {
    return value;
  }
  const errorMessage = getValidationError(validate, value);

  if (errorMessage === undefined) {
    return value;
  }

  if (!canCorrectInput) {
    // 管道输入无法原位修正，直接报错也避免读取本应属于后续 prompt 的数据。
    throw new Error(errorMessage);
  }
  const restoreValidatedInputMode = enterValidatedInputMode();

  if (!restoreValidatedInputMode) {
    throw new Error('Input validation requires an interactive terminal.');
  }

  try {
    // Bun 1.4 尚无文本校验交互；这里暂按主流 CLI 原位显示错误，未来需重新对照 Bun。
    const correctedValue = readCorrectedInput(
      value,
      errorMessage,
      defaultValue,
      validate,
    );

    if (correctedValue !== INPUT_INTERRUPTED) {
      return correctedValue;
    }
  } finally {
    restoreValidatedInputMode();
  }

  process.kill(process.pid, 'SIGINT');
  return null;
}
