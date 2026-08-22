import { type CommandExample } from '#src/decorators/Command';
import {
  type TextStyle,
  ANSI,
  colorize,
  isColorEnabled,
  visibleTextWidth,
} from '#src/utils/terminal';

import { type CommandDefinition, type ProgramDefinition } from './definition';

interface CommandHelpRow {
  category: string | undefined;
  name: string;
  synopsis: string;
  description: string;
}

interface FlagHelpRow {
  short: string | undefined;
  long: string;
  takesValue: boolean;
  description: string;
}

type HelpStyle = 'blue' | 'bold' | 'cyan' | 'dim' | 'green';

const HELP_STYLE_CODES: Record<HelpStyle, string> = {
  blue: '\x1b[34m',
  bold: '\x1b[1m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
};

// Bun 的命令列表和顶层选项使用固定列，子命令选项按最长名称动态计算列宽。
const COMMAND_SYNOPSIS_COLUMN = 12;
const COMMAND_DESCRIPTION_COLUMN = 33;
const TOP_LEVEL_FLAG_COLUMN_WIDTH = 30;
const STYLE_MARKER = '\0';
const GLOBAL_FLAG_ROWS: readonly FlagHelpRow[] = [
  {
    short: 'h',
    long: 'help',
    takesValue: false,
    description: 'Display this menu and exit',
  },
  {
    short: 'v',
    long: 'version',
    takesValue: false,
    description: 'Print version and exit',
  },
];

function styleHelpText(
  style: HelpStyle | readonly HelpStyle[],
  text: string,
): string {
  if (!isColorEnabled()) {
    return text;
  }
  const styles: readonly HelpStyle[] = Array.isArray(style)
    ? style
    : [style as HelpStyle];
  const prefix = styles.map(currentStyle => HELP_STYLE_CODES[currentStyle]);

  return `${prefix.join('')}${text}${ANSI.RESET}`;
}

function renderTopLevelUsage(executableName: string): string {
  const plainText = `Usage: ${executableName} <command> [...flags] [...args]`;

  if (!isColorEnabled()) {
    return plainText;
  }
  return (
    `${HELP_STYLE_CODES.bold}Usage:${ANSI.RESET} ` +
    `${HELP_STYLE_CODES.bold}${executableName} <command> ` +
    `${HELP_STYLE_CODES.cyan}[...flags]${ANSI.RESET} ` +
    `${HELP_STYLE_CODES.bold}[...args]${ANSI.RESET}`
  );
}

function toStyleList(
  style: TextStyle | readonly TextStyle[] | undefined,
): TextStyle[] {
  if (style === undefined) {
    return [];
  }
  return Array.isArray(style) ? [...style] : [style as TextStyle];
}

function renderCommandName(
  name: string,
  style: TextStyle | readonly TextStyle[] | undefined,
): string {
  if (style === undefined) {
    return styleHelpText('bold', name);
  }

  if (!isColorEnabled()) {
    return name;
  }
  // 命令名可能与 ANSI 参数重名，使用名称校验明确禁止的 NUL 定位正文起点。
  const styledMarker = colorize(['bold', ...toStyleList(style)], STYLE_MARKER);
  const markerIndex = styledMarker.indexOf(STYLE_MARKER);

  return `${styledMarker.slice(0, markerIndex)}${name}${ANSI.RESET}`;
}

function createCommandRows(program: ProgramDefinition): CommandHelpRow[] {
  const rows: CommandHelpRow[] = [];

  for (const command of program.commands) {
    const alias = command.aliases[0];
    const aliasHint = alias
      ? ` ${styleHelpText('dim', `(${program.executableName} ${alias})`)}`
      : '';

    rows.push({
      category: command.commandOptions.category,
      name: command.commandOptions.name,
      synopsis: command.commandOptions.args ?? '',
      description: (command.commandOptions.description ?? '') + aliasHint,
    });
  }

  return rows;
}

function renderAlignedHelpRow(
  name: string,
  synopsis: string,
  description: string,
): string {
  const namePrefix = `  ${name}`;
  const synopsisPadding = ' '.repeat(
    Math.max(
      name ? 1 : 0,
      COMMAND_SYNOPSIS_COLUMN - visibleTextWidth(namePrefix),
    ),
  );
  const synopsisPrefix = `${namePrefix}${synopsisPadding}${synopsis}`;
  const descriptionPadding = ' '.repeat(
    Math.max(1, COMMAND_DESCRIPTION_COLUMN - visibleTextWidth(synopsisPrefix)),
  );

  return `${synopsisPrefix}${descriptionPadding}${description}`.trimEnd();
}

function renderCommandRows(program: ProgramDefinition): string[] {
  const rows = createCommandRows(program);
  const helpName = '<command>';
  const helpSynopsis = '--help';
  const rowsByCategory = new Map<string | undefined, CommandHelpRow[]>();

  // Map 保留首次出现顺序，未配置的分类因此仍保持命令声明顺序。
  for (const row of rows) {
    const categoryRows = rowsByCategory.get(row.category);

    if (categoryRows) {
      categoryRows.push(row);
    } else {
      rowsByCategory.set(row.category, [row]);
    }
  }
  const categories = program.programOptions.categories;
  const configuredCategories = Object.keys(categories ?? {});
  const categoryOrder = [
    ...configuredCategories.filter(category => rowsByCategory.has(category)),
    ...Array.from(rowsByCategory.keys()).filter(
      category =>
        category === undefined || !configuredCategories.includes(category),
    ),
  ];
  const renderedRows: string[] = [];

  for (const category of categoryOrder) {
    const categoryRows = rowsByCategory.get(category);

    if (!categoryRows) {
      continue;
    }

    if (renderedRows.length > 0) {
      renderedRows.push('');
    }
    const categoryStyle =
      category !== undefined &&
      categories !== undefined &&
      Object.hasOwn(categories, category)
        ? categories[category]
        : undefined;

    for (const row of categoryRows) {
      const name = row.name ? renderCommandName(row.name, categoryStyle) : '';
      const synopsis = row.synopsis ? styleHelpText('dim', row.synopsis) : '';

      renderedRows.push(renderAlignedHelpRow(name, synopsis, row.description));
    }
  }

  if (renderedRows.length > 0) {
    renderedRows.push('');
  }
  renderedRows.push(
    renderAlignedHelpRow(
      styleHelpText('dim', helpName),
      styleHelpText(['bold', 'cyan'], helpSynopsis),
      'Print help text for command.',
    ),
  );

  return renderedRows;
}

function renderFlagName(row: FlagHelpRow): string {
  const shortFlag = row.short
    ? `  ${styleHelpText('cyan', `-${row.short}`)}, `
    : '      ';
  const longFlag = styleHelpText('cyan', `--${row.long}`);
  const valueHint = row.takesValue
    ? styleHelpText(['dim', 'cyan'], '=<val>')
    : '';

  return `${shortFlag}${longFlag}${valueHint}`;
}

function getFlagColumnWidth(row: FlagHelpRow): number {
  return visibleTextWidth(row.long) + (row.takesValue ? 6 : 0);
}

function renderFlagRows(
  rows: readonly FlagHelpRow[],
  topLevel = false,
): string[] {
  const flagColumnWidth = topLevel
    ? TOP_LEVEL_FLAG_COLUMN_WIDTH
    : Math.max(2, ...rows.map(getFlagColumnWidth));

  return rows.map(row => {
    const spacesAfter = ' '.repeat(flagColumnWidth - getFlagColumnWidth(row));
    const descriptionSpacing = topLevel ? spacesAfter : `  ${spacesAfter}  `;

    return `${renderFlagName(row)}${descriptionSpacing}${row.description}`;
  });
}

export function renderTopLevelHelp(
  program: ProgramDefinition,
  showAllFlags = false,
): string {
  const versionSuffix = program.programOptions.version
    ? ` ${styleHelpText('dim', `(${program.programOptions.version})`)}`
    : '';
  const description =
    program.programOptions.description ??
    `${program.executableName} is a command line tool.`;
  const lines = [
    `${isColorEnabled() ? ANSI.RESET : ''}${description}${versionSuffix}`,
    '',
    renderTopLevelUsage(program.executableName),
    '',
    styleHelpText('bold', 'Commands:'),
    ...renderCommandRows(program),
  ];

  if (showAllFlags) {
    lines.push(
      '',
      styleHelpText('bold', 'Flags:'),
      ...renderFlagRows(GLOBAL_FLAG_ROWS, true),
    );
  }
  const details = Object.entries(program.programOptions.details ?? {});

  if (details.length > 0) {
    lines.push('');

    for (const [label, value] of details) {
      const padding = ' '.repeat(
        Math.max(1, COMMAND_DESCRIPTION_COLUMN - visibleTextWidth(label)),
      );

      lines.push(`${label}${padding}${value}`);
    }
  }
  return lines.join('\n');
}

function createFlagRows(command: CommandDefinition): FlagHelpRow[] {
  const rows: FlagHelpRow[] = [
    {
      short: 'h',
      long: 'help',
      takesValue: false,
      description: 'Display this menu and exit',
    },
  ];
  const claimedShortNames = new Set<string>(['h']);

  for (const option of command.optionRegistry.values()) {
    if (option.short !== undefined) {
      claimedShortNames.add(option.short);
    }
  }

  for (const [optionName, option] of command.optionRegistry) {
    if (!option.description) {
      continue;
    }
    const isNegated = option.type === 'boolean' && option.defaultValue === true;
    const implicitShort =
      optionName.length === 1 && !claimedShortNames.has(optionName)
        ? optionName
        : undefined;

    rows.push({
      short: isNegated ? undefined : (option.short ?? implicitShort),
      long: isNegated ? `no-${optionName}` : optionName,
      takesValue: option.type === 'string',
      description: option.description,
    });
  }

  return rows;
}

function renderExample(example: CommandExample): string[] {
  const lines: string[] = [];

  if (example.description) {
    lines.push(`  ${styleHelpText('dim', example.description)}`);
  }
  lines.push(`  ${styleHelpText(['bold', 'green'], example.syntax)}`);

  return lines;
}

export function renderCommandHelp(
  program: ProgramDefinition,
  command: CommandDefinition,
): string {
  const argsSuffix = command.commandOptions.args
    ? ` ${styleHelpText('blue', command.commandOptions.args)}`
    : '';
  const lines = [
    `${styleHelpText('bold', 'Usage')}: ${styleHelpText(['bold', 'green'], `${program.executableName} ${command.commandOptions.name}`)} ${styleHelpText('cyan', '[flags]')}${argsSuffix}`,
  ];

  if (command.aliases.length > 0) {
    const aliases = command.aliases
      .map(alias =>
        styleHelpText(['bold', 'green'], `${program.executableName} ${alias}`),
      )
      .join(', ');

    lines.push(`${styleHelpText('bold', 'Alias')}: ${aliases}`);
  }

  if (command.commandOptions.description) {
    lines.push(`  ${command.commandOptions.description}`);
  }
  lines.push('', styleHelpText('bold', 'Flags:'));

  const flagRows = createFlagRows(command);

  lines.push(...renderFlagRows(flagRows));

  if (
    command.commandOptions.examples &&
    command.commandOptions.examples.length > 0
  ) {
    lines.push('', styleHelpText('bold', 'Examples:'));

    for (const [index, example] of command.commandOptions.examples.entries()) {
      if (!example) {
        continue;
      }

      if (index > 0) {
        lines.push('');
      }
      lines.push(...renderExample(example));
    }
  }

  if (
    command.commandOptions.epilog &&
    command.commandOptions.epilog.length > 0
  ) {
    lines.push('', ...command.commandOptions.epilog);
  }
  return lines.join('\n');
}
