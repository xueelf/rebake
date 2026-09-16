import { stripVTControlCharacters } from 'node:util';

import { runFromPipe, runInTerminal } from './terminal';

function parsePromptOutput(output: string, stderr = '') {
  return {
    output: stripVTControlCharacters(output).replaceAll('\r\n', '\n'),
    rawOutput: output,
    result: output.match(/RESULT=([^\r\n]+)/)?.[1] ?? stderr.trim(),
  };
}

export async function runPromptInTerminal(
  fixture: string,
  options?: Parameters<typeof runInTerminal>[1],
) {
  const result = await runInTerminal(fixture, options);

  return { ...result, ...parsePromptOutput(result.output) };
}

export async function runPromptFromPipe(
  fixture: string,
  options?: Parameters<typeof runFromPipe>[1],
) {
  const result = await runFromPipe(fixture, options);

  return { ...result, ...parsePromptOutput(result.stdout, result.stderr) };
}
