interface ScreenSize {
  cols: number;
  rows: number;
}

// eslint-disable-next-line no-control-regex -- 屏幕验证需要解释原始 ANSI 字节。
const TERMINAL_TOKENS = /\x1b\[[0-?]*[ -/]*[@-~]|[\s\S]/gu;
// eslint-disable-next-line no-control-regex -- 仅支持 prompt 使用的相对向上移动控制码。
const CURSOR_UP = /^\x1b\[(\d+)A$/u;

// 仅解释这些 prompt 使用的控制码；未知序列直接失败，避免屏幕断言静默失真。
export function renderTerminalScreen(
  output: string,
  { cols, rows }: ScreenSize,
): string[] {
  const blankLine = () => Array<string>(cols).fill(' ');
  const screen = Array.from({ length: rows }, blankLine);
  let row = 0;
  let column = 0;
  const newLine = () => {
    row += 1;

    if (row === rows) {
      screen.shift();
      screen.push(blankLine());
      row -= 1;
    }
  };

  for (const token of output.match(TERMINAL_TOKENS) ?? []) {
    if (token.startsWith('\x1b')) {
      if (token.endsWith('m')) {
        continue;
      }
      const cursorUp = CURSOR_UP.exec(token);

      if (cursorUp) {
        row = Math.max(0, row - Number(cursorUp[1]));
        column = Math.min(column, cols - 1);
        continue;
      }

      if (token === '\x1b[0K' || token === '\x1b[0J') {
        screen[row]!.fill(' ', column);

        if (token === '\x1b[0J') {
          for (const line of screen.slice(row + 1)) {
            line.fill(' ');
          }
        }
        continue;
      }
      throw new Error(
        `Unsupported terminal sequence: ${JSON.stringify(token)}`,
      );
    }

    if (token === '\r') {
      column = 0;
      continue;
    }

    if (token === '\n') {
      column = Math.min(column, cols - 1);
      newLine();
      continue;
    }
    const width = Bun.stringWidth(token);

    if (width === 0) {
      throw new Error(
        `Unsupported terminal character: ${JSON.stringify(token)}`,
      );
    }

    if (column + width > cols) {
      newLine();
      column = 0;
    }
    screen[row]![column] = token;

    if (width > 1) {
      screen[row]!.fill('', column + 1, column + width);
    }
    column += width;
  }
  return screen.map(line => line.join('').trimEnd());
}
