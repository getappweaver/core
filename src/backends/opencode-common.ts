import type { ProviderName } from '../providers/types';

import { getOpencodeAgentModel, readOpencodeConfig } from './opencode-config';

const DEFAULT_MODEL = 'opencode/big-pickle';

export type OpencodeConfiguredModelSource = 'agent' | 'root' | 'default';

export type OpencodeConfiguredModelResolution = {
  modelName: string;
  source: OpencodeConfiguredModelSource;
  rootModel: string | null;
  agentModel: string | null;
};

/**
 * Read model from opencode.json for the given mode, then fall back to the root
 * model, then the built-in default.
 */
export function resolveConfiguredModelFromOpencodeConfig(
  dmBotRoot: string,
  agentName: string,
): OpencodeConfiguredModelResolution {
  const config = readOpencodeConfig(dmBotRoot);
  const agentModel = getOpencodeAgentModel(config, agentName);

  if (agentModel) {
    return {
      modelName: agentModel,
      source: 'agent',
      rootModel: config.rootModel,
      agentModel,
    };
  }

  if (config.rootModel) {
    return {
      modelName: config.rootModel,
      source: 'root',
      rootModel: config.rootModel,
      agentModel: null,
    };
  }

  return {
    modelName: DEFAULT_MODEL,
    source: 'default',
    rootModel: null,
    agentModel: null,
  };
}

/**
 * When provider is routstr and model does not already start with "routstr/", add the prefix.
 * Otherwise return the model unchanged.
 */
export function normalizeModelForProvider(
  model: string | null | undefined,
  providerName: ProviderName | null,
): string | null | undefined {
  if (model == null) {
    return model;
  }

  if (providerName === 'routstr' && !model.startsWith('routstr/')) {
    return `routstr/${model}`;
  }

  return model;
}

export type ParseModelProps = {
  dmBotRoot: string;
  agentName: string;
  modelOverride: string | null | undefined;
  providerName: ProviderName | null;
};
