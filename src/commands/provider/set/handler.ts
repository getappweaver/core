import type { CoreDb } from '@src/db';
import {
  ProviderNameSchema,
  getAgentBackend,
  getModelOverride,
  getRoutstrModel,
  getRoutstrSkKey,
  setProviderName,
} from '@src/db';
import { log } from '@src/logger';

import type { ProviderSetRepresentation } from './representation';

type HandleProviderSetProps = {
  seenDb: CoreDb;
  name: string | null | undefined;
  prefix: string;
};

function toRepresentation(
  data: ProviderSetRepresentation['data'],
): ProviderSetRepresentation {
  return {
    kind: 'provider.set',
    version: 1,
    meta: { command: 'provider', subcommand: 'set' },
    data,
  };
}

export function handleProviderSet(
  props: HandleProviderSetProps,
): ProviderSetRepresentation {
  const { seenDb, name, prefix } = props;
  const providerOpts = ProviderNameSchema.options.join('|');

  if (!name) {
    return toRepresentation({
      view: 'usage',
      prefix,
      providerOpts,
    });
  }

  const parsed = ProviderNameSchema.safeParse(name);

  if (!parsed.success) {
    return toRepresentation({
      view: 'invalid',
      name,
      providerOpts,
    });
  }

  const backendName = getAgentBackend(seenDb);

  setProviderName(seenDb, parsed.data);

  if (parsed.data === 'routstr') {
    const skKey = getRoutstrSkKey(seenDb);
    const modelOverride = getModelOverride(seenDb, backendName);
    const routstrModel = getRoutstrModel(seenDb);

    if (modelOverride && !modelOverride.startsWith('routstr/')) {
      log.warn(
        `Current model override "${modelOverride}" is not a routstr model — it will likely fail.
        \nRun "ai provider models" to list available models for the provider and then
        \nRun "ai model set routstr/<id>" to set the model.`,
      );
    } else if (!routstrModel && !modelOverride?.startsWith('routstr/')) {
      log.warn(
        `No routstr model configured. Run "ai provider models" to list available models for the provider 
        and then
        \nRun "ai model set routstr/<id>" to set the model.`,
      );
    }

    return toRepresentation({
      view: 'routstr',
      sessionKeyPreview: skKey ? `${skKey.slice(0, 16)}...` : null,
      hasSessionKey: Boolean(skKey),
    });
  }

  return toRepresentation({ view: 'local' });
}
