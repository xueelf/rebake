import { dlopen } from 'bun:ffi';
import { readSync } from 'node:fs';

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
  // musl 的加载器也将 libc.* 解析为自身，因此 Linux 无需额外的库名回退。
  const library = dlopen(
    process.platform === 'darwin' ? 'libc.dylib' : 'libc.so.6',
    {
      poll: {
        args: ['ptr', process.platform === 'darwin' ? 'u32' : 'u64', 'i32'],
        returns: 'i32',
      },
    } as const,
  );
  // pollfd 由 int fd、short events 和 short revents 组成；Bun 平台均为小端。
  const pollDescriptor = new Int32Array([process.stdin.fd, 1]);

  return {
    close() {
      library.close();
    },
    readByte() {
      if (preservedStdinByte !== undefined) {
        return readStdinByteOrEof();
      }
      // 超时为零，只探测实际 stdin，既不依赖控制终端，也不修改共享 fd 的阻塞模式。
      const ready = library.symbols.poll(pollDescriptor, 1, 0);

      if (ready < 0) {
        throw new Error('Cannot poll stdin for queued input.');
      }

      if (ready === 0) {
        return undefined;
      }
      const inputByte = readStdinByteOrEof();

      return inputByte === -1 ? undefined : inputByte;
    },
  };
}
