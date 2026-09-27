import type { CoreDb } from '@src/db';

import {
  capabilityRegistry,
  createCapabilityClient,
} from '../capabilities/registry';

import { ModelSourceCoordinator } from './coordinator';
import { createCoreModelSourceProvider } from './core-provider';

export { ModelSourceCoordinator } from './coordinator';
export type {
  ModelSourceOption,
  ModelSourceSnapshot,
  PreparedModelRun,
} from './coordinator';

export function registerCoreModelSource(props: {
  db: CoreDb;
  dmBotRoot: string;
  parentOfBotRoot: string;
}): void {
  capabilityRegistry.registerProviders({
    source: {
      type: 'core',
      id: 'appweaver-core',
      alias: 'core',
      version: '12.8.6',
      title: 'Core models',
      description: 'AppWeaver OpenCode model catalog.',
      iconUrl: null,
    },
    providers: [createCoreModelSourceProvider(props)],
  });
}

export function createModelSourceCoordinator(
  db: CoreDb,
): ModelSourceCoordinator {
  return new ModelSourceCoordinator(
    db,
    createCapabilityClient({
      registry: capabilityRegistry,
      caller: { type: 'core', component: 'model-source-coordinator' },
    }),
  );
}
