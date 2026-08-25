import { dlopen } from 'bun:ffi';

const STD_INPUT_HANDLE = -10;
const ENABLE_PROCESSED_INPUT = 0x0001;
const ENABLE_LINE_INPUT = 0x0002;
const ENABLE_ECHO_INPUT = 0x0004;
const ENABLE_VIRTUAL_TERMINAL_INPUT = 0x0200;

// Bun FFI 要求 Windows HANDLE 使用 u64，不能声明为普通指针。
const windowsConsoleLibrary =
  process.platform === 'win32'
    ? dlopen('kernel32.dll', {
        GetStdHandle: {
          args: ['i32'],
          returns: 'u64',
        },
        GetConsoleMode: {
          args: ['u64', 'ptr'],
          returns: 'i32',
        },
        SetConsoleMode: {
          args: ['u64', 'u32'],
          returns: 'i32',
        },
      } as const)
    : undefined;

function updateWindowsInputMode(
  setFlags: number,
  unsetFlags: number,
): (() => void) | undefined {
  if (!windowsConsoleLibrary) {
    return undefined;
  }
  const inputHandle =
    windowsConsoleLibrary.symbols.GetStdHandle(STD_INPUT_HANDLE);

  if (!inputHandle) {
    return undefined;
  }
  const originalMode = new Uint32Array(1);

  if (
    windowsConsoleLibrary.symbols.GetConsoleMode(inputHandle, originalMode) ===
    0
  ) {
    return undefined;
  }
  const mode = originalMode[0];

  if (
    mode === undefined ||
    windowsConsoleLibrary.symbols.SetConsoleMode(
      inputHandle,
      (mode | setFlags) & ~unsetFlags,
    ) === 0
  ) {
    return undefined;
  }
  return () => {
    windowsConsoleLibrary.symbols.SetConsoleMode(inputHandle, mode);
  };
}

export function enterInputMode(): (() => void) | undefined {
  if (process.platform !== 'win32') {
    return undefined;
  }
  // Bun 会暂时关闭 VT 输入，避免 Windows 的退格键一次删除整行。
  return updateWindowsInputMode(0, ENABLE_VIRTUAL_TERMINAL_INPUT);
}

export function enterValidatedInputMode(): (() => void) | undefined {
  // 校验失败后需要保留并重绘输入，因此必须由应用接管终端回显和行编辑。
  if (process.platform === 'win32') {
    return enterSelectMode();
  }

  if (
    process.stdin.isTTY !== true ||
    typeof process.stdin.setRawMode !== 'function'
  ) {
    return undefined;
  }
  const setRawMode = process.stdin.setRawMode.bind(process.stdin);

  setRawMode(true);

  return () => {
    setRawMode(false);
  };
}

export function enterSelectMode(): (() => void) | undefined {
  if (process.platform !== 'win32') {
    return undefined;
  }
  return updateWindowsInputMode(
    ENABLE_VIRTUAL_TERMINAL_INPUT | ENABLE_PROCESSED_INPUT,
    ENABLE_LINE_INPUT | ENABLE_ECHO_INPUT,
  );
}
