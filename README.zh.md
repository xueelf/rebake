# Rebake

Rebake 是一个基于 Bun 开发的 CLI 装饰器（Decorator）实现，你可以轻松通过 ECMAScript 最新装饰器语法，来创建自己的命令行工具。

使用其他语言阅读：[English](./README.md) | 简体中文

## 介绍

我们都知道，在传统开发中，如果想使用 JS 开发一个命令行工具，目前 npm 上所有的依赖包都是通过**链式调用**实现的：

```javascript
const cli = require('other package');

function reverseString(text) {
  return text.split('').reverse().join('');
}

cli
  .name('my-tools')
  .version('1.1.4')
  .description('Some of my command line tools.');

cli
  .command('echo')
  .description('Output a text to the terminal.')
  .argument('<text>')
  .option('-r, --reverse', 'Reverse of the string.', false)
  .action(({ args, options }) => {
    const { text } = args;
    const { reverse } = options;

    console.log(reverse ? reverseString(text) : text);
  });

cli.parse();
```

在早期，JS 并没有装饰器的概念，TS 中的装饰器也是通过 [reflect-metadata](https://www.npmjs.com/package/reflect-metadata) 这个依赖库实现的，但它并不是 ECMAScript 的官方规范。现在，我们可以直接通过 Bun 来运行原生装饰器：

```typescript
import { Command, execute, Option, Program } from 'rebake';

@Command({
  name: 'echo',
  args: '<text>',
  description: 'Output a text to the terminal.',
})
class EchoCommand {
  @Option({ short: 'r', description: 'Reverse of the string.' })
  static reverse: boolean = false;

  constructor(text: string) {
    console.log(EchoCommand.reverse ? this.reverseString(text) : text);
  }
  reverseString(text: string) {
    return text.split('').reverse().join('');
  }
}

@Program({
  name: 'my-tools',
  version: '1.1.4',
  description: 'Some of my command line tools.',
  commands: [EchoCommand],
})
class Tools {}

execute(Tools);
```

这很酷，不是么？代码的可读性更高，也更利于模块化管理。

## 安装

> 由于当前装饰器处于 [stage 3](https://github.com/tc39/proposal-decorators) 状态，所以该项目目前是一个纯 TypeScript 包，你可以使用 Bun 来直接运行。

### 什么是 Bun？

Bun 是一个 JavaScript runtime，与 Node.js、Deno 一样，但它可以原生运行 TypeScript 代码，并支持新版装饰器。

你可以在终端执行对应的脚本进行安装：

```shell
# macOS & Linux
curl -fsSL https://bun.com/install | bash
```

```shell
# Windows
powershell -c "irm bun.sh/install.ps1|iex"
```

除此之外，也还能访问 [Bun 官方文档](https://bun.com/docs/installation#installation) 查看更多安装方式。

### 依赖

在做好准备工作后，我们便可以通过 `bun add` 来添加依赖项：

```shell
bun add rebake
```

## 使用

以下是一个完整的单文件示例，展示了如何使用 Rebake 快速构建一个具有参数与选项的命令行工具：

```typescript
import { Command, execute, Option, Program } from 'rebake';

@Command({
  name: 'echo',
  args: '<text>',
  description: 'Output a text to the terminal.',
})
class EchoCommand {
  @Option({ short: 'r', description: 'Reverse of the string.' })
  static reverse: boolean = false;

  constructor(message: string) {
    console.log(EchoCommand.reverse ? this.reverseString(message) : message);
  }
  reverseString(text: string) {
    return text.split('').reverse().join('');
  }
}

@Program({
  name: 'my-tools',
  version: '1.1.4',
  description: 'Some of my command line tools.',
  commands: [EchoCommand],
})
class Tools {}

execute(Tools);
```

如果你在 `tsconfig.json` 的 `compilerOptions` 中，**手动配置**了 `lib` 选项，那么在使用 TypeScript 原生装饰器时，你需要追加配置 `"ESNext.Decorators"` 来获取最新的装饰器语法支持：

```json
{
  "compilerOptions": {
    "lib": ["ESNext", "ESNext.Decorators"]
  }
}
```

保存 `cli.ts` 代码后，即可通过 Bun 直接运行。Rebake 会在应用启动时自动收集定义的装饰器元数据（Metadata），并最终输出 CLI 面板：

```shell
$ bun cli.ts
```

```
Some of my command line tools. (1.1.4)

Usage: my-tools <command> [...flags] [...args]

Commands:
  echo      <text>               Output a text to the terminal.

  <command> --help               Print help text for command.
```

如果不知道命令支持哪些选项，也可以追加 `-h` 获得该命令的说明文档：

```shell
$ bun cli.ts echo -h
```

```
Usage: my-tools echo [flags] <text>

  Output a text to the terminal.

Flags:
  -h, --help       Display this menu and exit
  -r, --reverse    Reverse of the string.
```

输入对应的命令，即可运行程序，参数将被按顺序注入到构造函数中：

```shell
$ bun cli.ts echo ciallo
```

```
ciallo
```

追加选项短名 `-r` 输出翻转后的字符串：

```shell
$ bun cli.ts echo ciallo -r
```

```
ollaic
```

## API 与说明

Rebake 深度复刻了 Bun 原生 CLI 的默认行为，旨在为使用 Bun 的开发者带来一致的感观体验。

### 程序入口：`@Program(options?: ProgramOptions)`

`@Program` 是应用程序的主入口装饰器。它用于定义 CLI 的全局配置，并作为所有命令的挂载点：

```typescript
@Program({
  name: 'my-tools',
  version: '1.1.4',
  description: 'Some of my command line tools.',
  commands: [CdCommand, EchoCommand, LsCommand, PingCommand, RmCommand],
  categories: {},
  details: {
    Blog: 'https://blog.yuki.sh',
    GitHub: 'https://github.com/xueelf',
  },
})
class Tools {}
```

- **`name`**：程序名称。
- **`version`**：当前版本号，可以使用 `--version` 或 `-v` 查询。
- **`description`**：程序的说明文本，会显示在最顶部。
- **`commands`**：配置可用的命令。以数组形式传入（使用 `@Command` 装饰器修饰的类）。
- **`categories`** _(可选)_: 传入对应的类别名与颜色样式，为命令进行分类排列。
- **`details`** _(可选)_: 在 CLI 面板的最底部添加额外信息。通常被用于放置相关的扩展链接、版权声明或作者信息等。

#### version

CLI 会默认创建 --version 与 -v 选项。

#### categories

若你的命令随项目的迭代逐渐增多，可传递此对象将命令在终端中进一步分类展示。

如果不配置 `categories`，所有命令会被堆叠在 _Commands:_ 标签下按照 `commands` 的传入顺序排列展示。例如上方的示例代码，未指定分类时在终端的布局排版是这样的：

```
Some of my command line tools. (1.1.4)

Usage: my-tools <command> [...flags] [...args]

Commands:
  cd        <path>               Change the current working directory.
  echo      <text>               Output a text to the terminal.
  ls
  ping      <host>               Check the network connectivity to a host.
  rm        <path>               Remove a file or directory.

  <command> --help               Print help text for command.

Blog                             https://blog.yuki.sh
GitHub                           https://github.com/xueelf
```

如果像上方示例代码那样配置，并在对应的命令装饰器（@Command）中指定 `category` 属性，CLI 排版会发生如下变化：

```
Some of my command line tools. (1.1.4)

Usage: my-tools <command> [...flags] [...args]

Commands:
  cd        <path>               Change the current working directory.
  ls
  rm        <path>               Remove a file or directory.

  ping      <host>               Check the network connectivity to a host.

  echo      <text>               Output a text to the terminal.

  <command> --help               Print help text for command.

Blog                             https://blog.yuki.sh
GitHub                           https://github.com/xueelf
```

不同分类之间会使用空行分隔。已在 `categories` 中配置的分类按照对象声明顺序排列，未配置的分类保持命令声明顺序。

默认情况下，_Commands:_ 标签内的命令名称会输出黑色加粗样式文本，我们可以通过 `categories` 自定义配置文本样式：

```typescript
@Program({
  categories: {
    file: 'blue',
    network: ['magenta', 'underline'],
    system: '#114514',
  },
})
class Tools {}
```

### 定义命令：`@Command(options: CommandOptions | string)`

`@Command` 用于声明单个可执行的命令。当该命令被调用时，Rebake 会将终端中输入的参数（Arguments）进行解析，并按顺序向下注入至该类的实例对象中：

```typescript
@Command({
  name: 'echo',
  aliases: ['print'],
  args: '<text>',
  description: 'Output a text to the terminal.',
  examples: [
    {
      description: 'Print a text',
      syntax: 'my-tools echo ciallo',
    },
    {
      description: 'Print a text in reverse',
      syntax: 'my-tools echo ciallo -r',
    },
  ],
})
class EchoCommand {
  @Option({ short: 'r', description: 'Reverse of the string.' })
  static reverse: boolean = false;

  constructor(message: string) {
    console.log(EchoCommand.reverse ? this.reverseString(message) : message);
  }
  reverseString(text: string) {
    return text.split('').reverse().join('');
  }
}
```

- **`name`**：命令名称。
- **`args`**：在 Usage 与顶层命令列表中展示的位置参数概要。
- **`aliases`**：调用别名。
- **`category`**：命令分类，对应 `@Program` 的 `categories` 键名。
- **`description`**：命令的说明文本，会自动对齐并显示在命令右侧。
- **`examples`**：为当前命令添加使用示例。每个对象必须包含完整的调用 `syntax`，也可以附带 `description`；语法文本将保持原样输出。
- **`epilog`**：在当前命令帮助面板的最底部追加额外的补充说明或提示文本，接受一个字符串数组，每个元素独占一行。

#### args

`args` 用于控制 Usage 与顶层命令列表中展示的位置参数文本，例如 `<text>`、`[options]`。它不会推断或校验参数语法。命令执行时，Bun 会将解析到的位置参数按照原始顺序依次传入命令类的 `constructor` 构造函数。

#### aliases

命令别名在 CLI 中很常见，例如我们经常使用的 `npm install` 就可以简写为 `npm i`，那么在这里 `i` 就是 `install` 的别名，你还可以指定多个：

```typescript
@Command({
  name: 'install',
  aliases: ['i', 'add'],
})
class InstallCommand {}
```

这样不管是 `my-tools install`、`my-tools i` 还是 `my-tools add`，都可以调用该命令。

### 定义选项：`@Option(options?: OptionOptions)`

选项装饰器必须作用于类中使用字符串命名的公开**静态属性（`static`）**，并使用 `string` 或 `boolean` 初始值。短名称只能包含一个字母或数字；`help` 和 `-h` 是保留名称：

```typescript
@Command('echo')
class EchoCommand {
  @Option({ short: 'r', description: 'Reverse of the string.' })
  static reverse: boolean = false;

  constructor() {
    console.log(EchoCommand.reverse);
  }
}
```

例如，布尔值将被当作简单的开关 flag 处理（有输入则视为 true）：

```shell
$ my-tools echo
$ my-tools echo --reverse
$ my-tools echo -r
```

```
false
true
true
```

初始值为 `true` 的布尔选项可以通过对应的 `--no-<名称>` 关闭，这与 Bun 的命令行行为保持一致。

```typescript
@Command('echo')
class EchoCommand {
  @Option({ short: 'o', description: '' })
  static outfile: string = 'out.txt';

  constructor() {
    console.log(EchoCommand.outfile);
  }
}
```

字符串类型则意味着必须且安全地接收一个值，你可以在调用时使用空格传入，或者使用**等号相连**：

```shell
$ my-tools echo --outfile index.txt
$ my-tools echo --outfile=index.txt
$ my-tools echo -o index.txt
$ my-tools echo -oindex.txt
```

```
index.txt
index.txt
index.txt
index.txt
```

在 CLI 的业界规范（如 POSIX Utility Syntax Guidelines 和 GNU 命令行标准）中，命令携带参数值是非常标准化且极其常见的做法。关于传参格式，在标准解析器（包括 Bun 内置的解析与 Node util.parseArgs）中的业界共识如下：

- 长参数
  - `--outfile out.txt`（空格）：POSIX 标准，最广泛的参数传值方式。
  - `--outfile=out.txt`（等号）
- 短参数
  - `-o out`（空格）：POSIX 标准，最广泛的短参数传值方式。
  - `-oout`（紧凑）：POSIX 标准，缩写连写，例如 mysql -uroot -ppassword。

等号 `=` 在规范中通常被设计为专门给长参数（--outfile=out）使用的，短参数使用等号在严格 POSIX 中是**不规范**的。请勿使用 `-o=out`，因为 `parseArgs` 会将开头的 `=` 视为参数值的一部分。

### 执行与运行：`execute(ProgramClass)`

当所有的命令与配置都定义好后，只需要将使用了 `@Program` 装饰器的主体类交由 `execute` 处理即可：

```typescript
import { execute } from 'rebake';

@Program({
  name: 'my-tools',
  version: '1.1.4',
  description: 'Some of my command line tools.',
  commands: [EchoCommand],
})
class Tools {}

execute(Tools);
```

`execute` 遵循命令行程序的处理方式：用户输入无效时会将错误写入标准错误流，并立即以状态码 `1` 终止进程。装饰器或命令配置错误则会抛出 `TypeError`。

## 自定义外观与交互

除了基础的 CLI 装饰器外，Rebake 还使用 Bun 与 TypeScript 实现了终端交互，不再附带 C 源码或平台相关二进制文件。除此之外，还提供了文本美化的工具。

### 文本着色：`colorize(style, text)`

如果你想为终端输出的文本加上醒目的颜色或装饰（如粗体、下划线），可以使用内置的 `colorize` 函数，这能直接将文本处理为 ANSI 控制码序列：

```typescript
import { colorize } from 'rebake';

// 单一颜色
console.log(colorize('cyan', 'Hello, Rebake!'));

// 颜色组合数组：[前景色, 样式]
console.log(colorize(['#57b497', 'bold'], 'Ciallo～(∠·ω< )⌒★'));
```

颜色输出遵循 Bun 的环境变量规则。`FORCE_COLOR` 优先于 `NO_COLOR`：除零值整数以及 `false`、`no`、`off` 外，其它值（包括空字符串）都会强制着色。未强制着色时，`NO_COLOR` 除未设置、空字符串、`0`、`false`、`no`、`off` 外，其它值都会禁用颜色；否则由目标输出流是否为 TTY 决定。

### 文本输入：`input(message, options?)`

阻塞当前主进程，等待用户在终端窗口输入一段普通的文本：

```typescript
import { input } from 'rebake/prompts';

const answer = input('What is your name', { default: 'Yuki' });
console.log(`Hello, ${answer}!`);
```

输入正文最多接受 1023 字节。超过限制时会抛出 `RangeError`，不会静默截断。

### 单选列表：`select(message, choices)`

基于终端渲染出一个可使用键盘交互（上下选择与回车确认）的单选列表：

```typescript
import { select } from 'rebake/prompts';

const framework = select('Choose your favorite framework', [
  { label: 'Vue', value: 'vue' },
  { label: 'React', value: 'react' },
  { label: 'Svelte', value: 'svelte' },
]);

console.log(`Your choice: ${framework?.value}`);
```

每个选项使用字符串类型的 `value`；`label` 控制显示文本，`selected` 用于设置初始选项，`disabled` 用于禁止选中。

提示文本和实际显示的选项标签都必须各自保持为一个逻辑行。当列表高度超过终端时，Rebake 会在终端容得下的可视窗口内保持当前选项可见。

除了使用键盘方向键控制上下选择，你还可以使用 `j`、`k` 操作。同时，你可以连按两下 `ESC` 或者直接使用 `Ctrl + c` 来取消，进程会按照 Bun 的行为以状态码 `0` 退出。

细心的你可能已经发现了，不论是 `input` 还是 `select`，在终端的排版样式以及逻辑交互上，也都是与 Bun 的 CLI 完全一致的。
