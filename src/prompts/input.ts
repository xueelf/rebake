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
// eslint-disable-next-line no-control-regex -- ANSI 字节必须整体分段，不能在折行时拆开颜色序列。
const INPUT_TEXT_PARTS = /\x1b\[[0-?]*[ -/]*[@-~]|[^\x1b]+|\x1b/gu;
const inputSegments = new Intl.Segmenter(undefined, {
  granularity: 'grapheme',
});

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

function wrapInputText(text: string, columns: number): string[] {
  const lines: string[] = [];
  let line = '';
  let width = 0;
  let style = '';

  for (const part of text.match(INPUT_TEXT_PARTS) ?? []) {
    if (part.startsWith('\x1b')) {
      line += part;

      if (part.endsWith('m')) {
        style = part === ANSI.RESET || part === '\x1b[m' ? '' : style + part;
      }
      continue;
    }

    for (const { segment } of inputSegments.segment(part)) {
      if (segment === '\n' || segment === '\r\n') {
        lines.push(line);
        line = style;
        width = 0;
        continue;
      }

      if (segment === '\r') {
        line += segment;
        width = 0;
        continue;
      }
      const characters =
        segment === '\t' ? Array<string>(8 - (width % 8)).fill(' ') : [segment];

      for (const character of characters) {
        const characterWidth = Bun.stringWidth(character);

        if (width + characterWidth > columns && width > 0) {
          lines.push(line);
          line = style;
          width = 0;
        }
        line += character;
        width += characterWidth;
      }
    }
  }
  lines.push(line);
  return lines;
}

function readCorrectedInput(
  prompt: string,
  initialInput: string,
  initialErrorMessage: string,
  defaultValue: string | undefined,
  validate: NonNullable<InputOptions['validate']>,
): string | null | typeof INPUT_INTERRUPTED {
  let value = initialInput === '' ? (defaultValue ?? '') : initialInput;
  let valueByteLength = textEncoder.encode(value).length;
  let errorVisible = true;
  let pendingInputByte: number | undefined;
  const columns = Math.max(1, process.stdout.columns || 80);
  const rows = Math.max(1, process.stdout.rows || 24);
  let cursorRow = Math.min(
    wrapInputText(prompt + initialInput, columns).length,
    rows - 1,
  );
  let renderedInput: string | undefined;
  const nonBlockingStdinReader = openNonBlockingStdinReader();
  const readInputByte = () => {
    if (pendingInputByte !== undefined) {
      const inputByte = pendingInputByte;

      pendingInputByte = undefined;
      return inputByte;
    }
    return readStdinByteOrEof();
  };
  const renderInput = (errorMessage?: string) => {
    const errorLines =
      errorMessage === undefined
        ? []
        : wrapInputText(`> ${errorMessage}`, columns).slice(0, rows - 1);
    const inputLines = wrapInputText(prompt + value, columns).slice(
      -(rows - errorLines.length),
    );
    const inputText = inputLines.join('\n');

    if (
      !errorVisible &&
      errorMessage === undefined &&
      renderedInput !== undefined &&
      inputText.startsWith(renderedInput)
    ) {
      writeStdout(inputText.slice(renderedInput.length));
    } else {
      // 保存的屏幕坐标不会跟随滚屏；始终从当前输入行相对定位可见交互块。
      writeStdout(
        '\r',
        cursorRow > 0 ? ANSI.CURSOR_UP(cursorRow) : '',
        ANSI.ERASE_DOWN,
        inputText,
      );

      if (errorLines.length > 0) {
        writeStdout(
          '\n',
          styleCliText('red', errorLines.join('\n')),
          '\r',
          ANSI.CURSOR_UP(errorLines.length),
          inputLines.at(-1)!,
        );
      }
    }
    cursorRow = inputLines.length - 1;
    renderedInput = inputText;
    errorVisible = errorMessage !== undefined;
  };
  const completeInput = () => {
    renderInput();
    writeStdout('\n');
  };

  try {
    renderInput(initialErrorMessage);

    while (true) {
      const inputByte = readInputByte();

      if (inputByte === -1 || inputByte === 4) {
        renderInput();
        return null;
      }

      if (inputByte === 3) {
        completeInput();
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
          completeInput();
          return submittedValue;
        }
        renderInput(errorMessage);
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
        renderInput();
        continue;
      }

      if (inputByte === 27) {
        completeInput();
        return null;
      }

      if (inputByte !== 9 && inputByte < 32) {
        continue;
      }
      const character = readInputCharacter(inputByte, readInputByte);

      if (character === null) {
        renderInput();
        return null;
      }
      const [text, byteLength] = character;

      if (valueByteLength + byteLength >= INPUT_BUFFER_SIZE) {
        throw new RangeError('Input cannot exceed 1023 bytes.');
      }

      value += text;
      valueByteLength += byteLength;
      renderInput();
    }
  } catch (error: unknown) {
    completeInput();
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

function formatInputPrompt(
  message: string,
  defaultValue: string | undefined,
): string {
  if (message.length > 0) {
    const hasVisibleDefault =
      defaultValue !== undefined && defaultValue.length > 0;
    const suffix = hasVisibleDefault ? `(${defaultValue}):` : ':';

    return `${styleCliText('cyan', message)}${hasVisibleDefault ? SPACE : ''}${styleCliText('dim', suffix)}${SPACE}`;
  }
  return SPACE;
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

  const prompt = formatInputPrompt(message, defaultValue);

  // 校验重绘需要已知的起始列，独立行也避免清理时覆盖调用方尚未换行的输出。
  writeStdout(canCorrectInput ? '\n' : '', prompt);

  if (canCorrectInput) {
    writeStdout(ANSI.CLEAR_TO_END);
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
      prompt,
      result,
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
