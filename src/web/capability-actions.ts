import type {
  CapabilityOperationId,
  CapabilityProviderSummary,
} from '@src/capabilities/types';
import { parseCapabilityOperationId } from '@src/capabilities/types';
import { capabilityRegistry } from '@src/core/capabilities/registry';
import { getPluginByAlias } from '@src/core/registry';
import type { WebAction, WebNode, WebNodeRoot } from '@src/web/ui-schema';

export type ExecuteWebCapabilityProps = {
  operation: CapabilityOperationId;
  input: unknown;
  consumerAlias: string;
  providerId: string | null;
  selection: 'auto' | 'always-choose';
  surface: 'timeline' | 'modal' | null;
  modalTitle: string | null;
};

type RootProps = {
  consumerAlias: string;
  operation: CapabilityOperationId;
  children: WebNode[];
};

type ChooserRootProps = {
  consumerAlias: string;
  operation: CapabilityOperationId;
  providers: CapabilityProviderSummary[];
  input: unknown;
  surface: 'timeline' | 'modal' | null;
  modalTitle: string | null;
};

function text(value: string): WebNode {
  return { type: 'text', value };
}

function root({ consumerAlias, operation, children }: RootProps): WebNodeRoot {
  return {
    kind: 'ui',
    version: 1,
    meta: { command: consumerAlias, subcommand: operation },
    tree: {
      type: 'element',
      tag: 'stack',
      props: { gap: 'sm' },
      children,
    },
  };
}

function missingRoot({
  consumerAlias,
  operation,
}: Pick<RootProps, 'consumerAlias' | 'operation'>): WebNodeRoot {
  const parsed = parseCapabilityOperationId(operation)!;
  const capability = `${parsed.capability.name}:v${parsed.capability.version}`;
  const filter = `capability:${capability}`;

  return root({
    consumerAlias,
    operation,
    children: [
      {
        type: 'element',
        tag: 'text',
        children: [
          text(`This action requires an installed ${capability} service.`),
        ],
      },
      {
        type: 'element',
        tag: 'button',
        props: {
          label: 'Find compatible apps',
          action: {
            type: 'clientAction',
            action: 'plugins.openCatalog',
            payload: { filter },
          },
        },
      },
    ],
  });
}

function providerAction({
  consumerAlias,
  operation,
  input,
  providerId,
  surface,
  modalTitle,
}: {
  consumerAlias: string;
  operation: CapabilityOperationId;
  input: unknown;
  providerId: string;
  surface: 'timeline' | 'modal' | null;
  modalTitle: string | null;
}): WebAction {
  return {
    type: 'capability',
    operation,
    input,
    consumerAlias,
    providerId,
    selection: 'auto',
    surface: surface ?? undefined,
    modalTitle: modalTitle ?? undefined,
  };
}

function chooserRoot({
  consumerAlias,
  operation,
  providers,
  input,
  surface,
  modalTitle,
}: ChooserRootProps): WebNodeRoot {
  return root({
    consumerAlias,
    operation,
    children: [
      {
        type: 'element',
        tag: 'text',
        children: [text('Choose a capability provider:')],
      },
      ...providers.map((provider): WebNode => ({
        type: 'element',
        tag: 'box',
        props: { padding: 'sm' },
        children: [
          {
            type: 'element',
            tag: 'row',
            props: { gap: 'sm', itemAlign: 'center' },
            children: [
              ...(provider.source.iconUrl
                ? [
                    {
                      type: 'element' as const,
                      tag: 'image' as const,
                      props: {
                        src: provider.source.iconUrl,
                        alt: '',
                        size: 'sm' as const,
                      },
                    },
                  ]
                : []),
              {
                type: 'element',
                tag: 'stack',
                props: { gap: 'xs', fill: true },
                children: [
                  {
                    type: 'element',
                    tag: 'text',
                    props: { weight: 'bold' },
                    children: [text(provider.source.title)],
                  },
                  {
                    type: 'element',
                    tag: 'text',
                    props: { tone: 'muted', size: 'sm' },
                    children: [
                      text(
                        `${provider.source.alias} · v${provider.source.version}`,
                      ),
                    ],
                  },
                  ...(provider.source.description
                    ? [
                        {
                          type: 'element' as const,
                          tag: 'text' as const,
                          props: { tone: 'muted' as const },
                          children: [text(provider.source.description)],
                        },
                      ]
                    : []),
                ],
              },
            ],
          },
          {
            type: 'element',
            tag: 'button',
            props: {
              label: 'Use provider',
              action: providerAction({
                consumerAlias,
                operation,
                input,
                providerId: provider.providerId,
                surface,
                modalTitle,
              }),
            },
          },
        ],
      })),
    ],
  });
}

export async function executeWebCapability({
  operation,
  input,
  consumerAlias,
  providerId,
  selection,
  surface,
  modalTitle,
}: ExecuteWebCapabilityProps): Promise<WebNodeRoot | null> {
  const parsed = parseCapabilityOperationId(operation);
  const consumer = getPluginByAlias(consumerAlias);

  if (!parsed) {
    throw new Error(`Invalid capability operation ID: ${operation}`);
  }

  if (!consumer) {
    throw new Error(`Unknown capability consumer: ${consumerAlias}`);
  }

  const providers = capabilityRegistry.listOperationProviders(operation);

  if (providerId === null && selection === 'always-choose') {
    return providers.length === 0
      ? missingRoot({ consumerAlias, operation })
      : chooserRoot({
          consumerAlias,
          operation,
          providers,
          input,
          surface,
          modalTitle,
        });
  }

  const result = await capabilityRegistry.invokeById({
    operationId: operation,
    provider: providerId ?? 'auto',
    input,
    caller: {
      type: 'plugin',
      pluginName: consumer.identity.name,
      alias: consumer.identity.alias,
    },
  });

  if (result.status === 'missing') {
    return missingRoot({ consumerAlias, operation });
  }

  if (result.status === 'selection-required') {
    return chooserRoot({
      consumerAlias,
      operation,
      providers: result.providers,
      input,
      surface,
      modalTitle,
    });
  }

  return capabilityRegistry.webResultFor(operation, result.output);
}
