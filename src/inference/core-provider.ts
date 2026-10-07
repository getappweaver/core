import { capabilityRegistry } from '@src/core/capabilities/registry';
import type { CoreDb } from '@src/db';
import { createCoreInferenceEndpointProvider } from '@src/web/core-inference';

type RegisterCoreInferenceEndpointsProps = {
  db: CoreDb;
  dmBotRoot: string;
  parentOfBotRoot: string;
};

export function registerCoreInferenceEndpoints({
  db,
  dmBotRoot,
  parentOfBotRoot,
}: RegisterCoreInferenceEndpointsProps): void {
  capabilityRegistry.registerProviders({
    source: {
      type: 'core',
      id: 'appweaver-core',
      alias: 'core',
      version: '13.9.2',
      title: 'Core inference',
      description: 'AppWeaver model and chat inference endpoints.',
      iconUrl: null,
    },
    providers: [
      createCoreInferenceEndpointProvider({
        seenDb: db,
        dmBotRoot,
        parentOfBotRoot,
      }),
    ],
  });
}
