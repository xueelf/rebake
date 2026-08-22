import { type CommandExample, Command, Program } from '#src/index';

export const validExample: CommandExample = {
  syntax: 'tool valid value',
};

// @ts-expect-error 示例必须显式提供完整命令，不能从 args 或命令名推断。
export const invalidExample: CommandExample = {};

@Command('valid')
export class ValidCommand {
  constructor(_value: string, _optional?: string) {}
}

// @ts-expect-error 命令构造函数只能接收终端传入的字符串位置参数。
@Command('invalid')
export class InvalidCommand {
  constructor(_value: number) {}
}

// @ts-expect-error 命令构造函数必须接受任意终端字符串，不能收窄为字面量。
@Command('narrow')
export class NarrowCommand {
  constructor(_value: 'only') {}
}

class InvalidProgramCommand {
  constructor(_value: number) {}
}

@Program({
  // @ts-expect-error Program 只能注册可接收终端字符串参数的命令类。
  commands: [InvalidProgramCommand],
})
export class InvalidProgram {}

// @ts-expect-error 命令会在执行时实例化，因此不能声明为抽象类。
@Command('abstract')
export abstract class AbstractCommand {}
