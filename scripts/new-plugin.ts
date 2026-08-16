// Interactive CLI adapter for the shared plugin scaffolder.

import { join } from 'path';
import * as readline from 'readline';

import { writeRestartRequestedFile } from '@src/commands/bot/request-watch-restart';
import {
  aliasToPascal,
  createPluginScaffold,
  defaultCoreApiVersion,
  isPluginAlias,
} from '@src/plugin-lifecycle/scaffold';

const ROOT = join(import.meta.dir, '..');

function ask(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main(): Promise<void> {
  console.log('Create a new plugin from the AppWeaver template.\n');

  const alias = await ask('Plugin alias (e.g. todo, reminder): ');

  if (!isPluginAlias(alias)) {
    throw new Error(
      'Alias must start with a lowercase letter and contain only lowercase letters, numbers, hyphens, or underscores.',
    );
  }

  const pascalAlias = aliasToPascal(alias);
  const defaultTitle = `${pascalAlias} app`;
  const defaultDescription = `${pascalAlias} plugin for AppWeaver`;

  const title = (await ask(`Title [${defaultTitle}]: `)) || defaultTitle;

  const description =
    (await ask(`Short description [${defaultDescription}]: `)) ||
    defaultDescription;

  const defaultCore = defaultCoreApiVersion(ROOT);

  const coreApiVersion =
    (await ask(`Core API version [${defaultCore}]: `)) || defaultCore;

  const result = createPluginScaffold({
    dmBotRoot: ROOT,
    alias,
    title,
    description,
    coreApiVersion,
    runGenerator: true,
  });

  writeRestartRequestedFile();

  console.log(`\nPlugin created at plugins/${result.alias}/`);
  console.log(`Registered locally as ${result.repo}.`);

  console.log(
    `Develop it with AI, then use /plugins releases to prepare its first publication.`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
