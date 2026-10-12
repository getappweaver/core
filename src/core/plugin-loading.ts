import { log } from '@src/logger';
import { PROCESS_INSTANCE_ID } from '@src/process-instance';

import type { BotPlugin, PluginHostContext } from './plugin';
import { registerPlugin } from './registry';

export type PluginLoadFailure = {
  alias: string;
  message: string;
  instanceId: string;
};

const failures = new Map<string, PluginLoadFailure>();

export function listPluginLoadFailures(): PluginLoadFailure[] {
  return [...failures.values()];
}

type LoadPluginProps = {
  alias: string;
  load: () => Promise<BotPlugin>;
  ctx: PluginHostContext;
};

/** Keep import and registration failures local to one installed app. */
export async function loadPlugin({
  alias,
  load,
  ctx,
}: LoadPluginProps): Promise<void> {
  try {
    const plugin = await load();
    registerPlugin({ alias, plugin, ctx });
    failures.delete(alias);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failures.set(alias, { alias, message, instanceId: PROCESS_INSTANCE_ID });
    log.error(`Failed to load app "${alias}": ${message}`);
  }
}
