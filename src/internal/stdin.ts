import { readSync } from 'node:fs';

const stdinByteBuffer = new Uint8Array(1);

// 同步 prompt 共用无缓冲单字节读取，避免前一个 prompt 预取后续输入。
export function readStdinByteOrEof(): number {
  const bytesRead = readSync(process.stdin.fd, stdinByteBuffer);

  if (bytesRead === 0) {
    return -1;
  }
  return stdinByteBuffer[0]!;
}
