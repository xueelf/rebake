import { readStdinByteOrEof } from '#src/internal/stdin';
import { enterSelectMode } from '#src/internal/terminal-mode';
import {
  ANSI,
  isColorEnabled,
  styleCliText,
  SYMBOL,
  writeStdout,
} from '#src/utils/terminal';

export interface SelectChoice {
  value: string;
  label?: string;
  disabled?: boolean;
  selected?: boolean;
}

type InteractionState = 'active' | 'cancelled' | 'confirmed';

function getChoiceLabel(choice: SelectChoice): string {
  return choice.label ?? choice.value;
}

function getInitialSelectionIndex(choices: readonly SelectChoice[]): number {
  const selectedChoiceIndex = choices.findIndex(
    choice => choice.selected && !choice.disabled,
  );

  if (selectedChoiceIndex !== -1) {
    return selectedChoiceIndex;
  }
  return choices.findIndex(choice => !choice.disabled);
}

function moveSelection(
  currentIndex: number,
  delta: number,
  choices: readonly SelectChoice[],
): number {
  let nextIndex = currentIndex;

  do {
    nextIndex = (nextIndex + delta + choices.length) % choices.length;
  } while (choices[nextIndex]?.disabled);

  return nextIndex;
}

function renderChoiceLine(choice: SelectChoice, isSelected: boolean): string {
  const label = getChoiceLabel(choice);

  if (choice.disabled) {
    return `${SYMBOL.INDENT}${styleCliText('dim', `${label} (disabled)`)}${ANSI.CLEAR_TO_END}\n`;
  }

  if (isSelected) {
    return `${SYMBOL.POINTER}${styleCliText('underline', label)}${ANSI.CLEAR_TO_END}\n`;
  }
  return `${SYMBOL.INDENT}${label}${ANSI.CLEAR_TO_END}\n`;
}

function drawChoices(
  choices: readonly SelectChoice[],
  selectedIndex: number,
  moveCursorUp = true,
): void {
  if (moveCursorUp) {
    writeStdout(ANSI.CURSOR_UP(choices.length));
  }

  for (const [index, choice] of choices.entries()) {
    writeStdout(renderChoiceLine(choice, index === selectedIndex));
  }
  writeStdout(ANSI.ERASE_DOWN);
}

function clearInteractiveBlock(choiceCount: number): void {
  writeStdout(ANSI.CURSOR_UP(choiceCount + 1), ANSI.ERASE_DOWN);
}

function trySetRawMode(
  setRawMode: (enabled: boolean) => unknown,
  enabled: boolean,
): void {
  try {
    setRawMode(enabled);
  } catch {
    // Bun 原生 prompt 忽略 raw mode 切换失败，交互流程仍继续执行。
  }
}

function readSelectByteOrEof(): number {
  try {
    return readStdinByteOrEof();
  } catch {
    // Bun 的 select 会按当前读取阶段将系统读取错误视为确认或取消。
    return -1;
  }
}

export function select(
  message: string,
  choices: readonly SelectChoice[],
): SelectChoice | null {
  if (choices.length === 0) {
    return null;
  }
  let selectedIndex = getInitialSelectionIndex(choices);

  if (selectedIndex === -1) {
    return null;
  }
  const setRawMode =
    process.platform !== 'win32' &&
    typeof process.stdin.setRawMode === 'function'
      ? process.stdin.setRawMode.bind(process.stdin)
      : undefined;
  const shouldSetRawMode =
    process.stdin.isTTY === true && setRawMode !== undefined;
  const colorEnabled = isColorEnabled();
  let interactionState: InteractionState = 'active';
  // Bun 使用数字快捷键时返回目标项，但完成行仍显示快捷键触发前的高亮项。
  let completionChoiceIndex = selectedIndex;
  let restoreTerminalMode: (() => void) | undefined;

  try {
    if (process.platform === 'win32') {
      restoreTerminalMode = enterSelectMode();
    } else if (shouldSetRawMode) {
      trySetRawMode(setRawMode, true);
      restoreTerminalMode = () => {
        trySetRawMode(setRawMode, false);
      };
    }
    writeStdout(
      SYMBOL.QUESTION,
      message,
      styleCliText('dim', ' - Press return to submit.'),
      '\n',
    );

    try {
      if (colorEnabled) {
        writeStdout(ANSI.CURSOR_HIDE);
      }
      // 首次渲染不回移光标，之后每次按键都覆盖整个选项区域。
      drawChoices(choices, selectedIndex, false);

      while (interactionState === 'active') {
        const inputByte = readSelectByteOrEof();
        let selectionDelta = 0;

        switch (inputByte) {
          // Bun 将 EOF 当作确认当前高亮项。
          case -1:
          case 10:
          case 13:
            interactionState = 'confirmed';
            break;

          case 3:
          case 4:
            interactionState = 'cancelled';
            break;

          case 27: {
            const nextByte = readSelectByteOrEof();

            if (nextByte !== 91) {
              interactionState = 'cancelled';
              break;
            }
            const arrowByte = readSelectByteOrEof();

            if (arrowByte === -1) {
              interactionState = 'cancelled';
            } else if (arrowByte === 65) {
              selectionDelta = -1;
            } else if (arrowByte === 66) {
              selectionDelta = 1;
            }
            break;
          }

          case 106:
            selectionDelta = 1;
            break;

          case 107:
            selectionDelta = -1;
            break;

          default:
            if (inputByte >= 49 && inputByte <= 57) {
              const directSelectionIndex = inputByte - 49;
              const directSelection = choices[directSelectionIndex];

              if (directSelection && !directSelection.disabled) {
                completionChoiceIndex = selectedIndex;
                selectedIndex = directSelectionIndex;
                interactionState = 'confirmed';
              }
            }
            break;
        }

        if (interactionState === 'active') {
          if (selectionDelta !== 0) {
            selectedIndex = moveSelection(
              selectedIndex,
              selectionDelta,
              choices,
            );
            completionChoiceIndex = selectedIndex;
          }
          drawChoices(choices, selectedIndex);
        }
      }
      clearInteractiveBlock(choices.length);

      const completionChoice = choices[completionChoiceIndex];

      if (completionChoice) {
        writeStdout(
          SYMBOL.SUCCESS,
          message,
          styleCliText('dim', ':'),
          ' ',
          getChoiceLabel(completionChoice),
          colorEnabled ? ANSI.RESET : '',
          '\n',
        );
      }
    } finally {
      // 读取或渲染失败时也必须恢复被隐藏的光标。
      if (colorEnabled) {
        writeStdout(ANSI.CURSOR_SHOW);
      }
    }
  } finally {
    restoreTerminalMode?.();
  }

  if (interactionState === 'cancelled') {
    writeStdout('\n', SYMBOL.ERROR, 'Cancelled\n');
    process.exit(0);
  }
  const selectedChoice = choices[selectedIndex];

  return selectedChoice ?? null;
}
