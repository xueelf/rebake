import { join } from 'node:path';

const projectDirectory = join(import.meta.dir, '..', '..');
const COLOR_ENV_KEYS = [
  'CI',
  'COLORTERM',
  'FORCE_COLOR',
  'GITHUB_ACTIONS',
  'NODE_DISABLE_COLORS',
  'NO_COLOR',
  'TERM',
  'TERM_PROGRAM',
  'TERM_PROGRAM_VERSION',
  'TMUX',
] as const;

export function getColorEnv(
  variables: Record<string, string> = {},
): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...process.env };

  // 隔离本机和 CI 的颜色配置，确保原始输出快照可重复。
  for (const key of COLOR_ENV_KEYS) {
    delete env[key];
  }
  return { ...env, TERM: 'xterm-256color', ...variables };
}

export function setColorEnv(variables: Record<string, string>): () => void {
  const environment = new Map(
    COLOR_ENV_KEYS.map(key => [key, process.env[key]]),
  );

  for (const key of COLOR_ENV_KEYS) {
    delete process.env[key];
  }
  Object.assign(process.env, { TERM: 'xterm-256color', ...variables });

  return () => {
    for (const [key, value] of environment) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  };
}

interface ProcessOptions {
  args?: readonly string[];
  env?: Record<string, string | undefined>;
}

interface TerminalOptions extends ProcessOptions {
  cols?: number;
  rows?: number;
  onData?: (terminal: Bun.Terminal, output: string) => void;
}

export async function runInTerminal(
  fixture: string,
  {
    args = [],
    env = getColorEnv({ NO_COLOR: '1' }),
    cols = 80,
    rows = 24,
    onData,
  }: TerminalOptions = {},
): Promise<{ exitCode: number; output: string }> {
  const decoder = new TextDecoder();
  let output = '';
  const terminalExit = Promise.withResolvers<void>();
  const child = Bun.spawn({
    cmd: [
      process.execPath,
      join(projectDirectory, 'tests/fixtures', fixture),
      ...args,
    ],
    cwd: projectDirectory,
    env,
    terminal: {
      cols,
      rows,
      data(terminal, bytes) {
        output += decoder.decode(bytes, { stream: true });

        try {
          onData?.(terminal, output);
        } catch (error: unknown) {
          terminalExit.reject(error);
        }
      },
      exit() {
        terminalExit.resolve();
      },
    },
  });

  try {
    const [exitCode] = await Promise.all([child.exited, terminalExit.promise]);

    // 等待 PTY 的剩余输出，并刷新流式解码器保留的尾部字节。
    output += decoder.decode();
    return { exitCode, output };
  } finally {
    child.kill();
    child.terminal?.close();
  }
}

export async function runFromPipe(
  fixture: string,
  {
    args = [],
    env = getColorEnv({ NO_COLOR: '1' }),
    input = '',
  }: ProcessOptions & { input?: string | Uint8Array } = {},
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const child = Bun.spawn({
    cmd: [
      process.execPath,
      join(projectDirectory, 'tests/fixtures', fixture),
      ...args,
    ],
    cwd: projectDirectory,
    env,
    stdin: new Blob([
      typeof input === 'string' ? input : Uint8Array.from(input),
    ]),
    stdout: 'pipe',
    stderr: 'pipe',
  });

  try {
    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);

    return { exitCode, stdout, stderr };
  } finally {
    child.kill();
  }
}
