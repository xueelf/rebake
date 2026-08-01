import { readSync } from 'node:fs';

const stdinByteBuffer = new Uint8Array(1);

// 同步 prompt 共用无缓冲单字节读取，避免前一个 prompt 预取后续输入。
export function readStdinByteOrEof(): number {
  try {
    return readSync(process.stdin.fd, stdinByteBuffer) === 1
      ? (stdinByteBuffer[0] ?? -1)
      : -1;
  } catch {
    return -1;
  }
}
