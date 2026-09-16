import { expect, test } from 'bun:test';

import { runFromPipe, runInTerminal } from './helpers/terminal';

test.skipIf(process.platform === 'win32')('无控制终端输入', async () => {
  let inputSent = false;
  const { exitCode, output } = await runInTerminal('stdin.ts', {
    args: ['detached'],
    onData(terminal, output) {
      if (!inputSent && output.includes('READY')) {
        inputSent = true;
        terminal.write('abc');
      }
    },
  });

  expect(exitCode).toBe(0);
  expect(JSON.parse(output.match(/RESULT=([^\r\n]+)/)![1]!)).toEqual({
    empty: true,
    first: 97,
    second: 98,
    third: 99,
    preserved: 90,
    drained: true,
    tty: true,
    controllingTerminal: false,
  });
});

test.skipIf(process.platform === 'win32')('读取错误', async () => {
  const result = await runFromPipe('stdin.ts', { args: ['error'] });

  expect(result).toEqual({
    exitCode: 0,
    stdout: 'ERROR=EBADF\n',
    stderr: '',
  });
});

test.skipIf(process.platform === 'win32')('管道 EOF', async () => {
  const { exitCode, stdout, stderr } = await runFromPipe('stdin.ts', {
    args: ['eof'],
    input: 'ab',
  });

  expect(exitCode).toBe(0);
  expect(JSON.parse(stdout.slice('RESULT='.length))).toEqual({
    first: 97,
    second: 98,
    eof: true,
    repeatedEof: true,
    blockingEof: -1,
  });
  expect(stderr).toBe('');
});
