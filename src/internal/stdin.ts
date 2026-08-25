import { closeSync, constants, openSync, readSync } from 'node:fs';

const stdinByteBuffer = new Uint8Array(1);
let preservedStdinByte: number | undefined;

export interface NonBlockingStdinReader {
  close(): void;
  readByte(): number | undefined;
}

// 同步 prompt 共用无缓冲单字节读取，避免前一个 prompt 预取后续输入。
export function readStdinByteOrEof(): number {
  if (preservedStdinByte !== undefined) {
    const inputByte = preservedStdinByte;

    preservedStdinByte = undefined;
    return inputByte;
  }
  const bytesRead = readSync(process.stdin.fd, stdinByteBuffer);

  if (bytesRead === 0) {
    return -1;
  }
  return stdinByteBuffer[0]!;
}

export function preserveStdinByte(inputByte: number): void {
  if (preservedStdinByte !== undefined) {
    throw new Error('Only one stdin byte can be preserved.');
  }
  preservedStdinByte = inputByte;
}

export function openNonBlockingStdinReader():
  NonBlockingStdinReader | undefined {
  if (process.platform === 'win32') {
    return undefined;
  }
  // CRLF 归一化和连续退格合并只能检查已经到达终端的字节，不能阻塞等待后续输入。
  const fileDescriptor = openSync(
    '/dev/tty',
    constants.O_RDONLY | constants.O_NONBLOCK,
  );
  const inputByteBuffer = new Uint8Array(1);

  return {
    close() {
      closeSync(fileDescriptor);
    },
    readByte() {
      try {
        const bytesRead = readSync(fileDescriptor, inputByteBuffer);

        return bytesRead === 0 ? undefined : inputByteBuffer[0];
      } catch (error: unknown) {
        const errorCode =
          typeof error === 'object' && error !== null && 'code' in error
            ? error.code
            : undefined;

        if (errorCode === 'EAGAIN' || errorCode === 'EWOULDBLOCK') {
          return undefined;
        }
        throw error;
      }
    },
  };
}
