import { stringWidth } from 'bun';
import { type InspectColor, styleText } from 'node:util';

type HexColor = `#${string}`;

export type TextStyle = InspectColor | HexColor;

type CliStyle = 'cyan' | 'dim' | 'green' | 'red' | 'underline';

const RESET = '\x1b[0m';
const FALSE_ENV_VALUES = new Set(['', '0', 'false', 'no', 'off']);
const FALSE_FORCE_COLOR_VALUES = new Set(['false', 'no', 'off']);

// 前景色和背景色需要使用完整 RESET 收尾，修饰符则可保留独立关闭行为。
const MODIFIER_STYLES = new Set<InspectColor>([
  'reset',
  'bold',
  'dim',
  'italic',
  'underline',
  'blink',
  'inverse',
  'hidden',
  'strikethrough',
  'doubleunderline',
]);

// 这些控制码来自 Bun CLI 的实际 PTY 输出，不能替换成视觉近似的写法。
const CLI_STYLE_CODES: Record<CliStyle, readonly [string, string]> = {
  cyan: [`${RESET}\x1b[36m`, RESET],
  dim: ['\x1b[2m', RESET],
  green: [`${RESET}\x1b[32m`, RESET],
  red: [`${RESET}\x1b[31m`, RESET],
  underline: ['\x1b[4m', '\x1b[24m'],
};

function isHexColor(style: TextStyle): style is HexColor {
  return style.startsWith('#');
}

function validateHexColor(color: HexColor): void {
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
    throw new TypeError(
      `Invalid hexadecimal color "${color}". Expected #RRGGBB.`,
    );
  }
}

function applyHexColor(color: HexColor, text: string): string {
  const red = Number.parseInt(color.slice(1, 3), 16);
  const green = Number.parseInt(color.slice(3, 5), 16);
  const blue = Number.parseInt(color.slice(5, 7), 16);

  return `\x1b[38;2;${red};${green};${blue}m${text}${RESET}`;
}

function isNoColorEnabled(value: string | undefined): boolean {
  return value !== undefined && !FALSE_ENV_VALUES.has(value.toLowerCase());
}

function isForceColorEnabled(value: string | undefined): boolean {
  if (value === undefined) {
    return false;
  }

  // Bun 将空字符串视为开启，并将合法的零值整数与常见假值视为未强制着色。
  return !(
    /^-?0(?:_?0)*$/.test(value) ||
    FALSE_FORCE_COLOR_VALUES.has(value.toLowerCase())
  );
}

function parseTextStyles(style: TextStyle | readonly TextStyle[]) {
  const styles = Array.isArray(style) ? style : [style];
  const hexColors = styles.filter(isHexColor);
  const inspectColors = styles.filter(
    (currentStyle): currentStyle is InspectColor => !isHexColor(currentStyle),
  );

  if (hexColors.length > 1) {
    throw new TypeError('Only one hexadecimal color can be applied.');
  }
  const hexColor = hexColors[0];

  if (hexColor) {
    validateHexColor(hexColor);
  }

  // 命名样式必须在禁色环境下也由 Bun 原生实现完成校验。
  if (inspectColors.length > 0) {
    styleText(inspectColors, '', { validateStream: false });
  }

  return { hexColor, inspectColors };
}

export function validateTextStyle(
  style: TextStyle | readonly TextStyle[],
): void {
  parseTextStyles(style);
}

export function colorize(
  style: TextStyle | readonly TextStyle[],
  text: string,
): string {
  const { hexColor, inspectColors } = parseTextStyles(style);

  if (!isColorEnabled()) {
    return text;
  }
  const styledText =
    inspectColors.length > 0
      ? styleText(inspectColors, text, { validateStream: false })
      : text;
  const normalizedText = inspectColors.some(
    currentStyle => !MODIFIER_STYLES.has(currentStyle),
  )
    ? styledText.replaceAll('\x1b[39m', RESET).replaceAll('\x1b[49m', RESET)
    : styledText;
  return hexColor ? applyHexColor(hexColor, normalizedText) : normalizedText;
}

export function isColorEnabled(
  stream: { readonly isTTY?: boolean } = process.stdout,
): boolean {
  if (isForceColorEnabled(process.env['FORCE_COLOR'])) {
    return true;
  }

  if (isNoColorEnabled(process.env['NO_COLOR'])) {
    return false;
  }
  return stream.isTTY === true;
}

export function styleCliText(
  style: CliStyle,
  text: string,
  stream: { readonly isTTY?: boolean } = process.stdout,
): string {
  // CLI 提示必须使用 Bun 自身的控制码组合，不能交给 styleText 重新选择。
  if (!isColorEnabled(stream)) {
    return text;
  }
  const [open, close] = CLI_STYLE_CODES[style];

  return `${open}${text}${close}`;
}

export function visibleTextWidth(text: string): number {
  // Bun.stringWidth 会同时忽略 ANSI 控制码并正确计算全角字符宽度。
  return stringWidth(text);
}

export const ANSI = {
  RESET,
  CURSOR_HIDE: '\x1b[?25l',
  CURSOR_SHOW: '\x1b[?25h',
  CURSOR_SAVE: '\x1b7',
  CURSOR_RESTORE: '\x1b8',
  CLEAR_TO_END: '\x1b[0K',
  ERASE_DOWN: '\x1b[0J',
  CURSOR_UP: (lineCount: number) => `\x1b[${lineCount}A`,
};

export const SPACE = ' ';

export const SYMBOL = {
  INDENT: SPACE.repeat(4),
  get POINTER(): string {
    // Bun 在无颜色模式下隐藏指针，但保留相同的文本缩进。
    const pointer = isColorEnabled()
      ? styleCliText('cyan', '❯')
      : SPACE.repeat(4);

    return `${pointer}${SPACE.repeat(3)}`;
  },
  get SUCCESS(): string {
    return `${styleCliText('green', '✓')}${SPACE}`;
  },
  get ERROR(): string {
    return `${styleCliText('red', 'x')}${SPACE}`;
  },
  get QUESTION(): string {
    return `${styleCliText('cyan', '?')}${SPACE}`;
  },
};

export function writeStdout(...parts: readonly string[]): void {
  process.stdout.write(parts.join(''));
}
