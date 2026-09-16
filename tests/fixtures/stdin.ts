import { closeSync, openSync } from 'node:fs';

import {
  openNonBlockingStdinReader,
  preserveStdinByte,
  readStdinByteOrEof,
} from '#src/internal/stdin';

const mode = process.argv[2];

if (mode === 'detached') {
  const child = Bun.spawn({
    cmd: [process.execPath, import.meta.path, 'tty'],
    stdin: process.stdin.fd,
    stdout: process.stdout.fd,
    stderr: process.stderr.fd,
    detached: true,
  });

  process.exit(await child.exited);
}
let controllingTerminal = false;

if (mode === 'tty') {
  try {
    const descriptor = openSync('/dev/tty', 'r');

    controllingTerminal = true;
    closeSync(descriptor);
  } catch (error: unknown) {
    if (!(error instanceof Error) || !('code' in error)) {
      throw error;
    }

    if (error.code !== 'ENXIO') {
      throw error;
    }
  }
  process.stdin.setRawMode(true);
}
const reader = openNonBlockingStdinReader();

if (!reader) {
  throw new Error('This fixture requires POSIX stdin polling.');
}

try {
  if (mode === 'error') {
    closeSync(process.stdin.fd);

    try {
      reader.readByte();
    } catch (error: unknown) {
      if (!(error instanceof Error) || !('code' in error)) {
        throw error;
      }
      process.stdout.write(`ERROR=${String(error.code)}\n`);
    }
  } else if (mode === 'eof') {
    const first = readStdinByteOrEof();
    const second = reader.readByte();
    const eof = reader.readByte() === undefined;
    const repeatedEof = reader.readByte() === undefined;
    const blockingEof = readStdinByteOrEof();

    process.stdout.write(
      `RESULT=${JSON.stringify({ first, second, eof, repeatedEof, blockingEof })}\n`,
    );
  } else {
    const empty = reader.readByte() === undefined;

    process.stdout.write('READY\n');

    const first = readStdinByteOrEof();
    const second = reader.readByte();
    const third = reader.readByte();

    preserveStdinByte(90);

    const preserved = reader.readByte();
    const drained = reader.readByte() === undefined;

    process.stdout.write(
      `RESULT=${JSON.stringify({
        empty,
        first,
        second,
        third,
        preserved,
        drained,
        tty: process.stdin.isTTY === true,
        controllingTerminal,
      })}\n`,
    );
  }
} finally {
  reader.close();

  if (mode === 'tty') {
    process.stdin.setRawMode(false);
  }
}
