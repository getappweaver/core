import {
  renderRoadmapFundWeb,
  renderRoadmapIssueModalWeb,
  renderRoadmapNewIssueWeb,
  renderRoadmapNewWorkflowWeb,
} from '@src/commands/roadmap/renderers/web';
import type {
  TimelineEventOutput,
  WebAction,
  WebNode,
  WebNodeRoot,
  WebOptimisticCommandPayload,
  WebOptimisticMutation,
} from '@src/web/ui-schema';

import { getEditableTextSnapshot } from '../editableTextRegistry';
import { afterNextPaint, createBrowserTrace } from '../monitoring';
import type { NostrInteractionRecordResult } from '../nostr/interactionState';
import { handleNostrLikeEventAction } from '../nostr/likeEventAction';
import {
  handleNostrFollowProfileAction,
  handleNostrOpenProfilePanelAction,
  handleNostrRunProfileAction,
  type WotFetchProfileResult,
} from '../nostr/profileAction';
import { handleNostrPublishKind1Action } from '../nostr/publishKind1Action';
import {
  handleNostrOpenReplyPanelAction,
  handleNostrSendReplyAction,
} from '../nostr/replyEventAction';
import {
  handleNostrOpenRepostPanelAction,
  handleNostrSendRepostOrQuoteAction,
} from '../nostr/repostEventAction';
import { loadSearchRelays } from '../nostr/searchRelays';
import {
  beginPluginInstallRestartStatus,
  clearPluginInstallRestartStatus,
} from '../restartStatus';
import { handleRoadmapCommentIssue } from '../roadmap/commentIssue';
import { handleRoadmapCreateIssue } from '../roadmap/createIssue';
import {
  handleRoadmapCreateWorkflow,
  handleRoadmapFetchWorkflowRepo,
} from '../roadmap/createWorkflow';
import { handleRoadmapLightningZap } from '../roadmap/lightningZap';
import {
  handleRoadmapDeleteIssue,
  handleRoadmapMarkIssue,
  handleRoadmapTrackIssue,
} from '../roadmap/markIssue';
import { splitCommandOutput, splitPromptPayload } from '../socket/dispatch';
import { emitStoryCommandCompleted } from '../story/events';
import type { TimelineItem } from '../types';
import { getResultSubcommandTag, summarizeInvocation } from '../utils';

import {
  parseBackgroundCommandStatus,
  setBackgroundCommandStatus,
} from './backgroundStatus';
import type {
  CommandsAdapters,
  CommandsHook,
  RequestChromeCommandProps,
  RunWebActionParams,
} from './types';

function shouldRefreshComposerAiState(
  command: string,
  subcommand: string,
): boolean {
  return (
    command === 'ai' &&
    [
      'agents set',
      'backend',
      'mode',
      'model',
      'provider',
      'root-model',
    ].includes(subcommand)
  );
}

function shouldRefreshCoreUpdateState(
  command: string,
  subcommand: string,
): boolean {
  return command === 'bot' && ['update-check', 'update'].includes(subcommand);
}

function withInitialRevealedIds(
  root: WebNodeRoot,
  revealIds: string[] | undefined,
): WebNodeRoot {
  if (revealIds === undefined || revealIds.length === 0) {
    return root;
  }

  return {
    ...root,
    initialRevealedIds: [...(root.initialRevealedIds ?? []), ...revealIds],
  };
}

function taskbarLoadingWeb(command: string, subcommand: string): WebNodeRoot {
  return {
    kind: 'ui',
    version: 1,
    meta: { command, subcommand },
    tree: {
      type: 'element',
      tag: 'box',
      props: { padding: 'md' },
      children: [
        {
          type: 'element',
          tag: 'stack',
          props: { gap: 'sm' },
          children: [
            {
              type: 'element',
              tag: 'text',
              props: { weight: 'bold' },
              children: [{ type: 'text', value: `/${command} ${subcommand}` }],
            },
            {
              type: 'element',
              tag: 'text',
              props: { tone: 'muted' },
              children: [{ type: 'text', value: 'Loading...' }],
            },
          ],
        },
      ],
    },
  };
}

function showsTimelineLoadingWidget(
  command: string,
  subcommand: string,
): boolean {
  return (
    command === 'plugins' &&
    ['releases', 'release', 'publish-status'].includes(subcommand)
  );
}

function timelineEventOutputToItem(
  output: TimelineEventOutput,
  id: string,
): TimelineItem | null {
  switch (output.event.type) {
    case 'diff':
      return {
        id,
        type: 'diff',
        files: output.event.files,
        meta: {
          title: output.event.title,
          subtitle: output.event.subtitle,
          origin: output.event.origin,
          scopePath: output.event.scopePath ?? null,
          repositoryPath: output.event.repositoryPath ?? null,
          stagedFiles: output.event.stagedFiles ?? [],
        },
      };
    default:
      return assertUnreachable(output.event.type);
  }
}

function assertUnreachable(value: never): never {
  throw new Error(`Unreachable: ${String(value)}`);
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringRecordValue(value: unknown): Record<string, unknown> {
  return recordValue(value) ?? {};
}

function parseOptimisticMutation(value: unknown): WebOptimisticMutation | null {
  const record = recordValue(value);

  if (!record || typeof record.type !== 'string') {
    return null;
  }

  if (record.type === 'removeEntity' && typeof record.entityKey === 'string') {
    return {
      type: 'removeEntity',
      entityKey: record.entityKey,
      pruneEmptyParents:
        typeof record.pruneEmptyParents === 'boolean'
          ? record.pruneEmptyParents
          : true,
    };
  }

  if (
    record.type === 'patchEntityProps' &&
    typeof record.entityKey === 'string'
  ) {
    return {
      type: 'patchEntityProps',
      entityKey: record.entityKey,
      props: stringRecordValue(record.props),
    };
  }

  if (
    record.type === 'patchEntityActions' &&
    typeof record.entityKey === 'string' &&
    Array.isArray(record.actions)
  ) {
    return {
      type: 'patchEntityActions',
      entityKey: record.entityKey,
      actions: record.actions.flatMap((entry) => {
        const actionRecord = recordValue(entry);

        if (!actionRecord || typeof actionRecord.key !== 'string') {
          return [];
        }

        return [
          {
            key: actionRecord.key,
            ...(typeof actionRecord.label === 'string'
              ? { label: actionRecord.label }
              : {}),
            ...(typeof actionRecord.ariaLabel === 'string'
              ? { ariaLabel: actionRecord.ariaLabel }
              : {}),
            ...(typeof actionRecord.active === 'boolean'
              ? { active: actionRecord.active }
              : {}),
            ...(typeof actionRecord.disabled === 'boolean'
              ? { disabled: actionRecord.disabled }
              : {}),
          },
        ];
      }),
    };
  }

  return null;
}

function parseOptimisticCommandPayload(
  value: unknown,
): WebOptimisticCommandPayload | null {
  const record = recordValue(value);
  const command = recordValue(record?.command);

  const mutations = Array.isArray(record?.mutations)
    ? record.mutations.flatMap((entry) => {
        const mutation = parseOptimisticMutation(entry);

        return mutation ? [mutation] : [];
      })
    : [];

  if (
    !command ||
    typeof command.command !== 'string' ||
    typeof command.subcommand !== 'string'
  ) {
    return null;
  }

  return {
    mutations,
    command: {
      command: command.command,
      subcommand: command.subcommand,
      arguments: stringRecordValue(command.arguments),
      options: stringRecordValue(command.options),
      ...(recordValue(command.monitoring)
        ? {
            monitoring:
              command.monitoring as WebOptimisticCommandPayload['command']['monitoring'],
          }
        : {}),
    },
    onError: 'log',
  };
}

function appendClassName(
  existing: string | undefined,
  className: string,
): string {
  return existing ? `${existing} ${className}` : className;
}

function highlightWebNodeTargets(
  node: WebNode,
  targetIds: Set<string>,
  scrollTargetId: string | null,
): WebNode {
  if (node.type !== 'element') {
    return node;
  }

  const nodeTargetId = node.props?.id ?? node.props?.storyTargetId;

  const shouldHighlight =
    nodeTargetId !== undefined && targetIds.has(nodeTargetId);

  const shouldScroll = shouldHighlight && nodeTargetId === scrollTargetId;

  return {
    ...node,
    props:
      shouldHighlight || shouldScroll
        ? {
            ...node.props,
            ...(shouldHighlight
              ? {
                  className: appendClassName(
                    node.props?.className,
                    'web-highlight-flash',
                  ),
                }
              : {}),
            ...(shouldScroll ? { scrollIntoViewOnMount: true } : {}),
          }
        : node.props,
    summary: node.summary
      ? highlightWebNodeTargets(node.summary, targetIds, scrollTargetId)
      : undefined,
    children: node.children?.map((child) =>
      highlightWebNodeTargets(child, targetIds, scrollTargetId),
    ),
  };
}

function highlightWebRootTargets(
  root: WebNodeRoot,
  targetIds: string[],
): WebNodeRoot {
  if (targetIds.length === 0) {
    return root;
  }

  return {
    ...root,
    tree: highlightWebNodeTargets(root.tree, new Set(targetIds), targetIds[0]),
  };
}

type EditableTextRunCommandAction = Extract<WebAction, { type: 'command' }>;

type RecordNostrInteractionProps = {
  result: NostrInteractionRecordResult;
  appendSystemMessage: (message: string) => void;
  runJsonCommandOutput: (props: {
    command: string;
    subcommand: string;
    payload: unknown;
  }) => Promise<ReturnType<typeof splitCommandOutput>>;
};

function isEditableTextRunCommandAction(
  value: unknown,
): value is EditableTextRunCommandAction {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    candidate.type === 'command' &&
    typeof candidate.command === 'string' &&
    typeof candidate.subcommand === 'string'
  );
}

function commandWithEditableText(props: {
  action: WebAction;
  appendSystemMessage: (message: string) => void;
}): WebAction | null {
  if (props.action.type !== 'clientAction') {
    return null;
  }

  const editableId = props.action.payload?.editableTextId;
  const contentArgument = props.action.payload?.contentArgument;
  const activeLineRefreshOption = props.action.payload?.activeLineRefreshOption;

  const activeLineScrollTokenOption =
    props.action.payload?.activeLineScrollTokenOption;

  const command = props.action.payload?.command;

  if (
    typeof editableId !== 'string' ||
    typeof contentArgument !== 'string' ||
    !isEditableTextRunCommandAction(command)
  ) {
    props.appendSystemMessage('Editable text save action is missing payload.');

    return null;
  }

  const snapshot = getEditableTextSnapshot(editableId);

  if (snapshot == null) {
    props.appendSystemMessage(`Editable text not found: ${editableId}`);

    return null;
  }

  return {
    ...command,
    arguments: {
      ...(command.arguments ?? {}),
      [contentArgument]: snapshot.text,
    },
    refresh:
      command.refresh == null
        ? undefined
        : {
            ...command.refresh,
            options: {
              ...(command.refresh.options ?? {}),
              ...(typeof activeLineRefreshOption === 'string'
                ? { [activeLineRefreshOption]: snapshot.activeLine }
                : {}),
              ...(typeof activeLineScrollTokenOption === 'string'
                ? {
                    [activeLineScrollTokenOption]: `${editableId}:${snapshot.activeLine}:${Date.now()}`,
                  }
                : {}),
            },
          },
  };
}

async function recordNostrInteraction({
  result,
  appendSystemMessage,
  runJsonCommandOutput,
}: RecordNostrInteractionProps): Promise<void> {
  try {
    const output = await runJsonCommandOutput({
      command: result.nrAlias,
      subcommand: 'interaction-record',
      payload: {
        arguments: {},
        options: {
          target_event_id: result.targetEventId,
          interaction_event_id: result.interactionEventId,
          user_pubkey: result.userPubkey,
          type: result.interactionType,
          interaction_created_at: result.interactionCreatedAt,
        },
      },
    });

    const text = output.text?.trim() ?? '';

    if (text.startsWith('Missing ') || text.startsWith('Unknown ')) {
      throw new Error(text);
    }

    for (const command of result.afterRecordCommands ?? []) {
      await runJsonCommandOutput({
        command: command.command,
        subcommand: command.subcommand,
        payload: {
          arguments: command.arguments ?? {},
          options: command.options ?? {},
        },
      });
    }
  } catch (err) {
    appendSystemMessage(
      `Could not persist Nostr interaction: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

function expandHighlightTargetTemplate(
  template: string,
  match: RegExpMatchArray,
): string {
  return template.replace(/\$(\d+)/g, (_placeholder, indexRaw: string) => {
    const index = Number.parseInt(indexRaw, 10);

    return match[index] ?? '';
  });
}

export function useCommands(adapters: CommandsAdapters): CommandsHook {
  const refreshGenerationBySource = new Map<string, number>();
  let chromeModalOriginParams: RunWebActionParams | null = null;

  const pendingReleasesBySource = new Map<
    string,
    Map<number, Set<() => void>>
  >();

  function beginRefreshGeneration(
    sourceId: string,
    releasePending: () => void,
  ): number {
    const generation = (refreshGenerationBySource.get(sourceId) ?? 0) + 1;
    refreshGenerationBySource.set(sourceId, generation);

    const releases = pendingReleasesBySource.get(sourceId) ?? new Map();
    const generationReleases = releases.get(generation) ?? new Set();
    generationReleases.add(releasePending);
    releases.set(generation, generationReleases);
    pendingReleasesBySource.set(sourceId, releases);

    return generation;
  }

  function settleRefreshGeneration(sourceId: string, generation: number): void {
    const releases = pendingReleasesBySource.get(sourceId);

    if (!releases) {
      return;
    }

    const isLatest = refreshGenerationBySource.get(sourceId) === generation;

    for (const [releaseGeneration, generationReleases] of releases) {
      if (
        releaseGeneration !== generation &&
        (!isLatest || releaseGeneration > generation)
      ) {
        continue;
      }

      for (const release of generationReleases) {
        release();
      }

      releases.delete(releaseGeneration);
    }

    if (releases.size === 0) {
      pendingReleasesBySource.delete(sourceId);
    }
  }

  async function refreshComposerAiState(): Promise<void> {
    if (adapters.authStatus() !== 'connected' || !adapters.wsConnected()) {
      adapters.setComposerAiState(null);

      return;
    }

    adapters.requestComposerAiState();
  }

  function requestChromeCommand(props: RequestChromeCommandProps): void {
    adapters.setChromeLoading(true);
    adapters.setChromeWeb(null);
    adapters.setChromeText(null);
    adapters.setChromeError(null);
    adapters.setChromePromptSession(null);

    if (!adapters.wsConnected()) {
      adapters.setChromeLoading(false);
      adapters.setChromeError('WebSocket is not connected.');

      return;
    }

    const requestId = adapters.createId();

    adapters.pendingRequests.set(requestId, {
      recordInTimeline: false,
      onCommandResult: (message) => {
        const output = splitCommandOutput(message.output);

        adapters.setChromeLoading(false);
        adapters.setChromeWeb(output.web);
        adapters.setChromeText(output.text);
      },
      onPrompt: (message) => {
        adapters.setPendingPromptRequestId(message.requestId);

        adapters.setChromePromptSession({
          requestId: message.requestId,
          prompt: message.prompt,
        });
      },
      onError: (message) => {
        adapters.setChromeLoading(false);
        adapters.setChromeError(message.message);
        adapters.setChromePromptSession(null);
      },
      onDone: () => {
        if (adapters.pendingPromptRequestId() === requestId) {
          adapters.setPendingPromptRequestId(null);
        }

        adapters.setChromePromptSession(null);
      },
    });

    try {
      adapters.sendSocketMessage({
        type: 'run_command',
        requestId,
        timelineId: adapters.timelineId(),
        command: props.command,
        subcommand: props.subcommand,
        payload: props.payload,
        recordInTimeline: false,
      });
    } catch (err) {
      adapters.pendingRequests.delete(requestId);
      adapters.setChromeLoading(false);
      adapters.setChromeError(err instanceof Error ? err.message : String(err));
    }
  }

  function openChromeWidget(props: {
    command: string;
    subcommand: string;
    title: string;
    iconUrl?: string | null;
  }): void {
    adapters.setChromeModal({
      command: props.command,
      subcommand: props.subcommand,
      title: props.title,
      iconUrl: props.iconUrl,
    });

    requestChromeCommand({
      command: props.command,
      subcommand: props.subcommand,
      title: props.title,
      payload: { arguments: {}, options: {} },
    });
  }

  function closeChromeModal(): void {
    const chromePrompt = adapters.chromePromptSession();

    if (
      chromePrompt &&
      adapters.pendingPromptRequestId() === chromePrompt.requestId
    ) {
      adapters.setPendingPromptRequestId(null);
    }

    adapters.setChromeModal(null);
    adapters.setChromeLoading(false);
    adapters.setChromeError(null);
    adapters.setChromeText(null);
    adapters.setChromeWeb(null);
    adapters.setChromePromptSession(null);
    chromeModalOriginParams = null;
  }

  async function executeCommandAction(
    action: Extract<WebAction, { type: 'command' }>,
  ): Promise<unknown> {
    const output = await runJsonCommandOutput({
      command: action.command,
      subcommand: action.subcommand,
      payload: {
        arguments: action.arguments,
        options: action.options,
      },
    });

    return output.clientView?.view === 'web.action-list'
      ? output.clientView.payload
      : null;
  }

  function runWebAction(action: WebAction, params?: RunWebActionParams): void {
    const wireAction = JSON.parse(JSON.stringify(action)) as WebAction;

    runWireWebAction(wireAction, params);
  }

  function runWireWebAction(
    action: WebAction,
    params?: RunWebActionParams,
  ): void {
    if (action.type === 'prompt_answer') {
      const promptRequestId =
        params?.promptRequestId ?? adapters.pendingPromptRequestId();

      if (!promptRequestId) {
        adapters.appendSystemMessage('No pending prompt to answer.');

        return;
      }

      adapters.setPendingPromptRequestId((current) =>
        current === promptRequestId ? null : current,
      );

      try {
        adapters.sendSocketMessage({
          type: 'prompt_answer',
          requestId: promptRequestId,
          answer: action.value,
        });
      } catch (err) {
        adapters.appendSystemMessage(
          err instanceof Error ? err.message : String(err),
        );
      }

      return;
    }

    if (action.type === 'clientAction') {
      const clientActionName = action.action.trim();

      const runClientAction = (
        actionPromise: Promise<
          void | false | NostrInteractionRecordResult | WotFetchProfileResult
        >,
      ): void => {
        void actionPromise
          .then((result) => {
            if (result === false) {
              return;
            }

            const recordPromise =
              result?.type === 'nostrInteractionRecord'
                ? recordNostrInteraction({
                    result,
                    appendSystemMessage: adapters.appendSystemMessage,
                    runJsonCommandOutput,
                  })
                : result?.type === 'wotFetchProfile'
                  ? runJsonCommandOutput({
                      command: 'wot',
                      subcommand: 'fetch-profile',
                      payload: {
                        arguments: { profile: result.profile },
                        options: {},
                      },
                    })
                      .then(() => undefined)
                      .catch(() => undefined)
                  : Promise.resolve();

            const refresh = action.refresh;

            if (!refresh || !params?.onReplaceRoot) {
              return;
            }

            void recordPromise.finally(() => {
              runWebAction(
                {
                  type: 'command',
                  command: refresh.command,
                  subcommand: refresh.subcommand,
                  arguments: refresh.arguments ?? {},
                  options: refresh.options ?? {},
                  recordInTimeline: false,
                },
                {
                  ...params,
                  uiExecutionPolicy: {
                    ...params.uiExecutionPolicy,
                    recordInTimeline: false,
                  },
                },
              );
            });
          })
          .catch((err) => {
            adapters.setChromeLoading(false);

            adapters.setChromeError(
              err instanceof Error ? err.message : String(err),
            );
          });
      };

      if (clientActionName === 'web.optimisticCommand') {
        const optimisticPayload = parseOptimisticCommandPayload(action.payload);

        if (!optimisticPayload) {
          adapters.appendSystemMessage('Invalid optimistic command payload.');

          return;
        }

        params?.applyOptimisticMutations?.(optimisticPayload.mutations);

        if (params?.webCommandSourceId) {
          adapters.endWebUiBusy(params.webCommandSourceId);

          if (params.webCommandSourceEntityKey) {
            adapters.endWebEntityPending(
              params.webCommandSourceId,
              params.webCommandSourceEntityKey,
            );
          }
        }

        const requestId = adapters.createId();
        const command = optimisticPayload.command;

        adapters.pendingRequests.set(requestId, {
          recordInTimeline: false,
          onCommandResult: () => {},
          onError: (message) => {
            adapters.appendSystemMessage(
              `Optimistic command failed: ${message.message}`,
            );
          },
        });

        try {
          adapters.sendSocketMessage({
            type: 'run_command',
            requestId,
            timelineId: adapters.timelineId(),
            command: command.command,
            subcommand: command.subcommand,
            payload: {
              arguments: command.arguments ?? {},
              options: command.options ?? {},
            },
            recordInTimeline: false,
          });
        } catch (err) {
          adapters.pendingRequests.delete(requestId);

          adapters.appendSystemMessage(
            err instanceof Error ? err.message : String(err),
          );
        }
      } else if (clientActionName === 'web.closeModal') {
        closeChromeModal();
      } else if (clientActionName === 'web.commandSequence') {
        const commands = Array.isArray(action.payload.commands)
          ? action.payload.commands
          : [];

        const mergeIndex =
          typeof action.payload.mergeFormOptionsIntoCommand === 'number'
            ? action.payload.mergeFormOptionsIntoCommand
            : null;

        const reserved = new Set([
          'commands',
          'mergeFormOptionsIntoCommand',
          'refreshCommand',
          'successMutations',
        ]);

        void (async () => {
          adapters.setChromeLoading(true);
          adapters.setChromeError(null);

          try {
            for (let index = 0; index < commands.length; index++) {
              const command = commands[index] as Record<string, unknown>;

              if (
                typeof command.command !== 'string' ||
                typeof command.subcommand !== 'string'
              ) {
                throw new Error('Invalid command sequence item.');
              }

              const options = {
                ...(typeof command.options === 'object' &&
                command.options !== null &&
                !Array.isArray(command.options)
                  ? (command.options as Record<string, unknown>)
                  : {}),
              };

              if (mergeIndex === index) {
                for (const [key, value] of Object.entries(action.payload)) {
                  if (!reserved.has(key)) {
                    options[key] = value;
                  }
                }
              }

              const output = await runJsonCommandOutput({
                command: command.command,
                subcommand: command.subcommand,
                payload: {
                  arguments: stringRecordValue(command.arguments),
                  options,
                },
              });

              const successTextPrefixes = Array.isArray(
                command.successTextPrefixes,
              )
                ? command.successTextPrefixes.filter(
                    (prefix): prefix is string => typeof prefix === 'string',
                  )
                : [];

              if (
                successTextPrefixes.length > 0 &&
                !successTextPrefixes.some((prefix) =>
                  output.text?.startsWith(prefix),
                )
              ) {
                throw new Error(output.text ?? 'Command sequence failed.');
              }
            }

            const completionParams = chromeModalOriginParams ?? params;

            const successMutations = Array.isArray(
              action.payload.successMutations,
            )
              ? action.payload.successMutations.flatMap((entry) => {
                  const mutation = parseOptimisticMutation(entry);

                  return mutation ? [mutation] : [];
                })
              : [];

            completionParams?.applyOptimisticMutations?.(successMutations);
            closeChromeModal();

            const refreshCommand = action.payload.refreshCommand;

            if (
              typeof refreshCommand === 'object' &&
              refreshCommand !== null &&
              !Array.isArray(refreshCommand)
            ) {
              const command = refreshCommand as Record<string, unknown>;

              if (
                typeof command.command === 'string' &&
                typeof command.subcommand === 'string'
              ) {
                runWebAction(
                  {
                    type: 'command',
                    command: command.command,
                    subcommand: command.subcommand,
                    arguments: stringRecordValue(command.arguments),
                    options: stringRecordValue(command.options),
                    recordInTimeline: false,
                  },
                  {
                    ...completionParams,
                    uiExecutionPolicy: {
                      ...completionParams?.uiExecutionPolicy,
                      recordInTimeline: false,
                      suppressSystemMessage: true,
                    },
                  },
                );
              }
            }
          } catch (err) {
            adapters.setChromeError(
              err instanceof Error ? err.message : String(err),
            );
          } finally {
            adapters.setChromeLoading(false);
          }
        })();
      } else if (clientActionName === 'web.copyText') {
        const text =
          typeof action.payload.text === 'string' ? action.payload.text : '';

        if (text.length > 0) {
          void navigator.clipboard.writeText(text).catch(() => {
            adapters.appendSystemMessage('Unable to copy text to clipboard.');
          });
        }
      } else if (clientActionName === 'plugins.openCatalog') {
        const filter =
          typeof action.payload.filter === 'string'
            ? action.payload.filter
            : '';

        if (filter.length > 0) {
          runWebAction({
            type: 'command',
            command: 'plugins',
            subcommand: 'install',
            arguments: { target: filter },
            options: {},
            recordInTimeline: false,
            surface: 'timeline',
          });
        }
      } else if (clientActionName === 'roadmap.openFund') {
        const payload = action.payload;
        const title = typeof payload.title === 'string' ? payload.title : '';

        adapters.setChromeModal({
          command: 'roadmap',
          subcommand: 'fund',
          title: title ? `Fund "${title}"` : 'Fund roadmap issue',
          iconUrl:
            '/builtin-icons/src__commands__roadmap__renderers__roadmap.svg',
        });

        adapters.setChromeLoading(false);
        adapters.setChromeError(null);
        adapters.setChromeText(null);

        adapters.setChromeWeb(
          renderRoadmapFundWeb({
            issueId: typeof payload.issueId === 'string' ? payload.issueId : '',
            title,
            sats: typeof payload.sats === 'number' ? payload.sats : 0,
            relay: typeof payload.relay === 'string' ? payload.relay : '',
            relays: Array.isArray(payload.relays)
              ? payload.relays.filter((relay) => typeof relay === 'string')
              : [],
          }),
        );
      } else if (clientActionName === 'roadmap.lightningZap') {
        runClientAction(
          handleRoadmapLightningZap({
            action,
            signEvent: adapters.signEvent,
            setChromeWeb: adapters.setChromeWeb,
            setChromeText: adapters.setChromeText,
            setChromeError: adapters.setChromeError,
            setChromeLoading: adapters.setChromeLoading,
          }),
        );
      } else if (clientActionName === 'editableText.runCommand') {
        const command = commandWithEditableText({
          action,
          appendSystemMessage: adapters.appendSystemMessage,
        });

        if (command !== null) {
          runWebAction(command, params);
        }
      } else if (clientActionName === 'roadmap.createIssue') {
        runClientAction(
          handleRoadmapCreateIssue({
            action,
            signEvent: adapters.signEvent,
            setChromeWeb: adapters.setChromeWeb,
            setChromeText: adapters.setChromeText,
            setChromeError: adapters.setChromeError,
            setChromeLoading: adapters.setChromeLoading,
            appendSystemMessage: adapters.appendSystemMessage,
          }),
        );
      } else if (clientActionName === 'roadmap.openIssue') {
        adapters.setChromeModal({
          command: 'roadmap',
          subcommand: 'issue',
          title: 'Roadmap issue',
          iconUrl:
            '/builtin-icons/src__commands__roadmap__renderers__roadmap.svg',
        });

        adapters.setChromeLoading(false);
        adapters.setChromeError(null);
        adapters.setChromeText(null);

        adapters.setChromeWeb(
          renderRoadmapIssueModalWeb({
            issue: action.payload.issue as never,
            workflow: action.payload.workflow as never,
            relay:
              typeof action.payload.relay === 'string'
                ? action.payload.relay
                : '',
            boardKey:
              typeof action.payload.boardKey === 'string'
                ? action.payload.boardKey
                : null,
            columnId:
              typeof action.payload.columnId === 'string'
                ? action.payload.columnId
                : null,
            focus:
              action.payload.focus === 'comments' ||
              action.payload.focus === 'manage'
                ? action.payload.focus
                : 'activity',
          }),
        );
      } else if (clientActionName === 'roadmap.openNewIssue') {
        adapters.setChromeModal({
          command: 'roadmap',
          subcommand: 'new',
          title: 'New roadmap issue',
          iconUrl:
            '/builtin-icons/src__commands__roadmap__renderers__roadmap.svg',
        });

        adapters.setChromeLoading(false);
        adapters.setChromeError(null);
        adapters.setChromeText(null);

        adapters.setChromeWeb(
          renderRoadmapNewIssueWeb({
            workflow: action.payload.workflow as never,
            relay:
              typeof action.payload.relay === 'string'
                ? action.payload.relay
                : '',
          }),
        );
      } else if (clientActionName === 'roadmap.openNewWorkflow') {
        adapters.setChromeModal({
          command: 'roadmap',
          subcommand: 'new-board',
          title: 'New roadmap board',
          iconUrl:
            '/builtin-icons/src__commands__roadmap__renderers__roadmap.svg',
        });

        adapters.setChromeLoading(false);
        adapters.setChromeError(null);
        adapters.setChromeText(null);

        adapters.setChromeWeb(
          renderRoadmapNewWorkflowWeb({
            projects: Array.isArray(action.payload.projects)
              ? (action.payload.projects as never)
              : [],
            relay:
              typeof action.payload.relay === 'string'
                ? action.payload.relay
                : '',
            relays: Array.isArray(action.payload.relays)
              ? (action.payload.relays as string[])
              : [],
          }),
        );
      } else if (clientActionName === 'roadmap.createWorkflow') {
        runClientAction(
          handleRoadmapCreateWorkflow({
            action,
            signEvent: adapters.signEvent,
            setChromeWeb: adapters.setChromeWeb,
            setChromeText: adapters.setChromeText,
            setChromeError: adapters.setChromeError,
            setChromeLoading: adapters.setChromeLoading,
            appendSystemMessage: adapters.appendSystemMessage,
          }),
        );
      } else if (clientActionName === 'roadmap.fetchWorkflowRepo') {
        runClientAction(
          handleRoadmapFetchWorkflowRepo({
            action,
            setChromeWeb: adapters.setChromeWeb,
            setChromeText: adapters.setChromeText,
            setChromeError: adapters.setChromeError,
            setChromeLoading: adapters.setChromeLoading,
          }),
        );
      } else if (clientActionName === 'roadmap.closeModal') {
        adapters.setChromeModal(null);
        adapters.setChromeLoading(false);
        adapters.setChromeWeb(null);
        adapters.setChromeText(null);
        adapters.setChromeError(null);
      } else if (clientActionName === 'roadmap.commentIssue') {
        runClientAction(
          handleRoadmapCommentIssue({
            action,
            signEvent: adapters.signEvent,
            setChromeWeb: adapters.setChromeWeb,
            setChromeText: adapters.setChromeText,
            setChromeError: adapters.setChromeError,
            setChromeLoading: adapters.setChromeLoading,
            appendSystemMessage: adapters.appendSystemMessage,
          }),
        );
      } else if (clientActionName === 'roadmap.markIssue') {
        runClientAction(
          handleRoadmapMarkIssue({
            action,
            currentUserPubkey: adapters.currentUserPubkey(),
            signEvent: adapters.signEvent,
            setChromeWeb: adapters.setChromeWeb,
            setChromeText: adapters.setChromeText,
            setChromeError: adapters.setChromeError,
            setChromeLoading: adapters.setChromeLoading,
            appendSystemMessage: adapters.appendSystemMessage,
          }),
        );
      } else if (clientActionName === 'roadmap.trackIssue') {
        runClientAction(
          handleRoadmapTrackIssue({
            action,
            currentUserPubkey: adapters.currentUserPubkey(),
            signEvent: adapters.signEvent,
            setChromeWeb: adapters.setChromeWeb,
            setChromeText: adapters.setChromeText,
            setChromeError: adapters.setChromeError,
            setChromeLoading: adapters.setChromeLoading,
            appendSystemMessage: adapters.appendSystemMessage,
          }),
        );
      } else if (clientActionName === 'roadmap.deleteIssue') {
        runClientAction(
          handleRoadmapDeleteIssue({
            action,
            currentUserPubkey: adapters.currentUserPubkey(),
            signEvent: adapters.signEvent,
            setChromeWeb: adapters.setChromeWeb,
            setChromeText: adapters.setChromeText,
            setChromeError: adapters.setChromeError,
            setChromeLoading: adapters.setChromeLoading,
            appendSystemMessage: adapters.appendSystemMessage,
          }),
        );
      } else if (clientActionName === 'nostr.publishKind1') {
        void handleNostrPublishKind1Action({
          action,
          currentUserPubkey: adapters.currentUserPubkey(),
          signEvent: adapters.signEvent,
          setChromeWeb: adapters.setChromeWeb,
          setChromeText: adapters.setChromeText,
          setChromeError: adapters.setChromeError,
          setChromeLoading: adapters.setChromeLoading,
          appendSystemMessage: adapters.appendSystemMessage,
        }).then((result) => {
          if (!result) {
            return;
          }

          const onSuccess = result.onSuccessCommand;

          runWebAction(
            {
              type: 'command',
              command: onSuccess.command,
              subcommand: onSuccess.subcommand,
              arguments: {
                ...onSuccess.arguments,
                nostrUrl: result.nostrUrl,
                url: result.nostrUrl,
              },
              options: onSuccess.options,
              refresh: action.refresh,
              recordInTimeline: false,
            },
            {
              ...params,
              uiExecutionPolicy: {
                ...params?.uiExecutionPolicy,
                recordInTimeline: false,
                suppressSystemMessage: true,
              },
            },
          );
        });
      } else if (clientActionName === 'nostr.likeEvent') {
        runClientAction(
          handleNostrLikeEventAction({
            action,
            currentUserPubkey: adapters.currentUserPubkey(),
            signEvent: adapters.signEvent,
            setChromeWeb: adapters.setChromeWeb,
            setChromeText: adapters.setChromeText,
            setChromeError: adapters.setChromeError,
            setChromeLoading: adapters.setChromeLoading,
            appendSystemMessage: adapters.appendSystemMessage,
          }),
        );
      } else if (clientActionName === 'nostr.runProfileAction') {
        if (!params?.applyOptimisticMutations) {
          adapters.appendSystemMessage('Profile action UI is unavailable.');

          return;
        }

        runClientAction(
          handleNostrRunProfileAction({
            action,
            executeCommandAction,
            applyOptimisticMutations: params.applyOptimisticMutations,
            setChromeError: adapters.setChromeError,
          }),
        );
      } else if (clientActionName === 'nostr.openProfilePanel') {
        runClientAction(
          handleNostrOpenProfilePanelAction({
            action,
            currentUserPubkey: adapters.currentUserPubkey(),
            signEvent: adapters.signEvent,
            setChromeWeb: adapters.setChromeWeb,
            setChromeText: adapters.setChromeText,
            setChromeModal: adapters.setChromeModal,
            setChromeError: adapters.setChromeError,
            setChromeLoading: adapters.setChromeLoading,
            appendSystemMessage: adapters.appendSystemMessage,
            executeCommandAction,
          }),
        );
      } else if (clientActionName === 'nostr.followProfile') {
        runClientAction(
          handleNostrFollowProfileAction({
            action,
            currentUserPubkey: adapters.currentUserPubkey(),
            signEvent: adapters.signEvent,
            setChromeWeb: adapters.setChromeWeb,
            setChromeText: adapters.setChromeText,
            setChromeModal: adapters.setChromeModal,
            setChromeError: adapters.setChromeError,
            setChromeLoading: adapters.setChromeLoading,
            appendSystemMessage: adapters.appendSystemMessage,
            executeCommandAction,
          }),
        );
      } else if (clientActionName === 'nostr.openReplyPanel') {
        runClientAction(
          handleNostrOpenReplyPanelAction({
            action,
            currentUserPubkey: adapters.currentUserPubkey(),
            signEvent: adapters.signEvent,
            setChromeWeb: adapters.setChromeWeb,
            setChromeText: adapters.setChromeText,
            setChromeModal: adapters.setChromeModal,
            setChromeError: adapters.setChromeError,
            setChromeLoading: adapters.setChromeLoading,
            appendSystemMessage: adapters.appendSystemMessage,
          }),
        );
      } else if (clientActionName === 'nostr.sendReply') {
        runClientAction(
          handleNostrSendReplyAction({
            action,
            currentUserPubkey: adapters.currentUserPubkey(),
            signEvent: adapters.signEvent,
            setChromeWeb: adapters.setChromeWeb,
            setChromeText: adapters.setChromeText,
            setChromeModal: adapters.setChromeModal,
            setChromeError: adapters.setChromeError,
            setChromeLoading: adapters.setChromeLoading,
            appendSystemMessage: adapters.appendSystemMessage,
          }),
        );
      } else if (clientActionName === 'nostr.openRepostPanel') {
        runClientAction(
          handleNostrOpenRepostPanelAction({
            action,
            currentUserPubkey: adapters.currentUserPubkey(),
            signEvent: adapters.signEvent,
            setChromeWeb: adapters.setChromeWeb,
            setChromeText: adapters.setChromeText,
            setChromeModal: adapters.setChromeModal,
            setChromeError: adapters.setChromeError,
            setChromeLoading: adapters.setChromeLoading,
            appendSystemMessage: adapters.appendSystemMessage,
          }),
        );
      } else if (clientActionName === 'nostr.sendRepostOrQuote') {
        runClientAction(
          handleNostrSendRepostOrQuoteAction({
            action,
            currentUserPubkey: adapters.currentUserPubkey(),
            signEvent: adapters.signEvent,
            setChromeWeb: adapters.setChromeWeb,
            setChromeText: adapters.setChromeText,
            setChromeModal: adapters.setChromeModal,
            setChromeError: adapters.setChromeError,
            setChromeLoading: adapters.setChromeLoading,
            appendSystemMessage: adapters.appendSystemMessage,
          }),
        );
      } else if (clientActionName === 'wallet.payInvoice') {
        runClientAction(
          (async () => {
            adapters.setChromeError(null);
            adapters.setChromeLoading(true);

            const invoice = action.payload?.invoice;

            if (typeof invoice !== 'string' || invoice.length === 0) {
              throw new Error('Missing invoice.');
            }

            const webln = window.webln;

            if (!webln) {
              throw new Error('WebLN not available.');
            }

            const isEnabled =
              typeof webln.isEnabled === 'function'
                ? await webln.isEnabled()
                : Boolean(webln.isEnabled);

            if (!isEnabled) {
              await webln.enable();
            }

            await webln.sendPayment(invoice);
            adapters.setChromeLoading(false);
          })().catch((err) => {
            adapters.setChromeError(
              err instanceof Error ? err.message : String(err),
            );

            adapters.setChromeLoading(false);

            return false;
          }),
        );
      } else {
        adapters.appendSystemMessage(
          `Unknown client action: ${JSON.stringify(action.action)}`,
        );
      }

      return;
    }

    if (action.type === 'agentPrompt') {
      const recordTl = action.recordInTimeline ?? true;
      const requestId = adapters.createId();

      adapters.pendingRequests.set(requestId, {
        onChatResult: (message) => {
          if (!recordTl) {
            return;
          }

          adapters.setTimeline((prev) => [
            ...prev,
            {
              id: adapters.createId(),
              type: 'chat',
              role: 'assistant',
              text: message.output || '(no output)',
            },
          ]);
        },
      });

      if (recordTl) {
        adapters.setTimeline((prev) => [
          ...prev,
          {
            id: adapters.createId(),
            type: 'chat',
            role: 'user',
            text: action.prompt,
          },
        ]);
      }

      try {
        adapters.sendSocketMessage({
          type: 'chat',
          requestId,
          timelineId: adapters.timelineId(),
          content: action.prompt,
        });
      } catch (err) {
        adapters.pendingRequests.delete(requestId);

        adapters.appendSystemMessage(
          err instanceof Error ? err.message : String(err),
        );
      }

      return;
    }

    if (action.type === 'capability') {
      if (!adapters.wsConnected()) {
        const message = 'WebSocket is not connected.';

        params?.onCapabilityError?.(message);
        params?.onCapabilitySettled?.();
        adapters.appendSystemMessage(message);

        return;
      }

      const requestId = adapters.createId();

      const sourceId = params?.onCapabilityResult
        ? undefined
        : params?.webCommandSourceId;

      let receivedOutput = false;
      let settled = false;

      if (action.surface === 'modal' && !params?.onCapabilityResult) {
        adapters.setChromeModal({
          command: action.consumerAlias,
          subcommand: action.operation,
          title: action.modalTitle ?? 'Capability Output',
        });

        adapters.setChromeLoading(true);
        adapters.setChromeError(null);
        adapters.setChromeText(null);
        adapters.setChromeWeb(null);
      }

      if (sourceId) {
        adapters.beginWebUiBusy(sourceId);
      }

      const settle = (): void => {
        if (settled) {
          return;
        }

        settled = true;
        params?.onCapabilitySettled?.();

        if (sourceId) {
          adapters.endWebUiBusy(sourceId);
        }

        if (action.surface === 'modal' && !params?.onCapabilityResult) {
          adapters.setChromeLoading(false);

          if (!receivedOutput) {
            adapters.setChromeText('Completed.');
          }
        }
      };

      adapters.pendingRequests.set(requestId, {
        recordInTimeline: action.surface === 'timeline',
        onCommandResult: (message) => {
          const output = splitCommandOutput(message.output);

          if (!output.web) {
            return;
          }

          receivedOutput = true;

          if (params?.onCapabilityResult?.(output.web)) {
            return;
          }

          if (action.surface === 'modal') {
            adapters.setChromeModal({
              command: action.consumerAlias,
              subcommand: action.operation,
              title: action.modalTitle ?? 'Capability Output',
            });

            adapters.setChromeLoading(false);
            adapters.setChromeError(null);
            adapters.setChromeText(null);
            adapters.setChromeWeb(output.web);

            return;
          }

          if (action.surface !== 'timeline' && params?.onReplaceRoot) {
            params.onReplaceRoot(output.web);

            return;
          }

          adapters.setTimeline((prev) => [
            ...prev,
            {
              id: adapters.createId(),
              type: 'command_result',
              command: action.consumerAlias,
              subcommand: action.operation,
              subcommandTag: action.operation,
              values: null,
              text: null,
              web: output.web,
              clientView: null,
            },
          ]);
        },
        onDone: settle,
        onError: (message) => {
          params?.onCapabilityError?.(message.message);

          if (action.surface === 'modal' && !params?.onCapabilityResult) {
            adapters.setChromeError(message.message);
          }

          settle();
        },
      });

      try {
        adapters.sendSocketMessage({
          type: 'run_capability',
          requestId,
          timelineId: adapters.timelineId(),
          operation: action.operation,
          input: action.input,
          consumerAlias: action.consumerAlias,
          providerId: action.providerId,
          selection: action.selection,
          surface: action.surface,
          modalTitle: action.modalTitle,
        });
      } catch (err) {
        adapters.pendingRequests.delete(requestId);
        settle();

        adapters.appendSystemMessage(
          err instanceof Error ? err.message : String(err),
        );
      }

      return;
    }

    if (action.type !== 'command') {
      return;
    }

    const commandAction = action;

    if (commandAction.presentation === 'form') {
      closeChromeModal();

      void adapters
        .runOpenCommandFormFromWebCommand(commandAction)
        .catch((err) => {
          adapters.appendSystemMessage(
            err instanceof Error ? err.message : String(err),
          );
        });

      return;
    }

    if (commandAction.surface === 'modal') {
      chromeModalOriginParams = params ?? null;

      adapters.setChromeModal({
        command: commandAction.command,
        subcommand: commandAction.subcommand,
        title: commandAction.modalTitle ?? 'Command Output',
      });

      requestChromeCommand({
        command: commandAction.command,
        subcommand: commandAction.subcommand,
        title: commandAction.modalTitle ?? 'Command Output',
        payload: {
          arguments: commandAction.arguments ?? {},
          options: commandAction.options ?? {},
        },
      });

      return;
    }

    if (commandAction.surface === 'timeline') {
      closeChromeModal();
    }

    if (commandAction.clientContext?.includes('nostrSearchRelays')) {
      void (async () => {
        const pubkey = adapters.currentUserPubkey();

        if (!pubkey) {
          runWebAction(
            {
              ...commandAction,
              clientContext: undefined,
            },
            params,
          );

          return;
        }

        const searchRelays = await loadSearchRelays({
          pubkey,
          decryptSelf: adapters.nip44DecryptSelf,
        });

        runWebAction(
          {
            ...commandAction,
            clientContext: undefined,
            options: {
              ...(commandAction.options ?? {}),
              nostrSearchRelays: searchRelays.relays.join(','),
            },
          },
          params,
        );
      })().catch((err) => {
        adapters.appendSystemMessage(
          err instanceof Error ? err.message : String(err),
        );

        runWebAction(
          {
            ...commandAction,
            clientContext: undefined,
          },
          params,
        );
      });

      return;
    }

    const requestId = adapters.createId();
    const uiExecutionPolicy = params?.uiExecutionPolicy;

    const browserTrace = commandAction.monitoring
      ? createBrowserTrace({
          name: commandAction.monitoring.name,
          attributes: commandAction.monitoring.attributes,
        })
      : null;

    const commandRoundTrip = browserTrace?.startSpan({
      name: `${commandAction.monitoring?.name ?? 'command'}.roundtrip`,
      attributes: {},
      parentSpanId: browserTrace.rootSpanId,
    });

    let commandRoundTripEnded = false;
    let refreshRoundTrip: ReturnType<
      NonNullable<typeof browserTrace>['startSpan']
    > | null = null;
    let browserTraceFinished = false;

    const finishBrowserTrace = (status: 'ok' | 'error'): void => {
      if (!browserTrace || browserTraceFinished) {
        return;
      }

      browserTraceFinished = true;
      commandRoundTrip?.end(status);
      refreshRoundTrip?.end(status);

      const spans = browserTrace.finish(status);

      if (spans.length > 0) {
        adapters.sendSocketMessage({
          type: 'record_monitoring_spans',
          requestId: adapters.createId(),
          spans,
        });
      }
    };

    if (commandAction.clientStatus?.pending) {
      if (!commandAction.clientStatus.statusTargetId) {
        adapters.appendSystemMessage(commandAction.clientStatus.pending);
      }
    }

    if (
      commandAction.command === 'plugins' &&
      commandAction.subcommand === 'install' &&
      commandAction.clientStatus?.restarting &&
      commandAction.clientStatus.success
    ) {
      beginPluginInstallRestartStatus({
        title:
          typeof commandAction.arguments?.target === 'string'
            ? commandAction.arguments.target
            : 'plugin',
        restarting: commandAction.clientStatus.restarting,
        success: commandAction.clientStatus.success,
      });
    }

    const actionTargetsTaskbar = adapters.isTaskbarSubcommand(
      commandAction.command,
      commandAction.subcommand,
    );

    const recordTl = actionTargetsTaskbar
      ? false
      : (commandAction.recordInTimeline ??
        uiExecutionPolicy?.recordInTimeline ??
        true);

    const suppressSystemMessage =
      uiExecutionPolicy?.suppressSystemMessage ?? false;

    const statusTargetId = commandAction.clientStatus?.statusTargetId;

    const shouldRefreshComposerAiStateAfterDone = shouldRefreshComposerAiState(
      commandAction.command,
      commandAction.subcommand,
    );

    const sourceId = params?.webCommandSourceId;
    const sourceEntityKey = params?.webCommandSourceEntityKey;

    const runsInBackground = commandAction.clientStatus?.background === true;

    const pendingPresentation =
      commandAction.pendingUi?.presentation ?? 'widget';

    const pendingLabel = commandAction.pendingUi?.label ?? 'Updating...';

    if (statusTargetId && commandAction.clientStatus?.pending) {
      setBackgroundCommandStatus({
        id: statusTargetId,
        state: 'pending',
        activeTargetId: commandAction.clientStatus.activeTargetId ?? null,
        message: commandAction.clientStatus.pending,
        output: null,
        progress: null,
      });
    }

    let refreshChildInFlight = false;
    let promptRefreshDispatchAttempted = false;
    let finalRefreshDispatchAttempted = false;
    let userPendingEnded = false;
    let backgroundOutputText: string | null = null;

    const refreshHighlightTargetIds = [
      ...(commandAction.refresh?.highlightTargetIds ?? []),
    ];

    if (actionTargetsTaskbar) {
      adapters.setTaskbarDockResult({
        command: commandAction.command,
        subcommand: commandAction.subcommand,
        values: {
          arguments: commandAction.arguments ?? {},
          options: commandAction.options ?? {},
        },
        output: {
          text: null,
          web: taskbarLoadingWeb(
            commandAction.command,
            commandAction.subcommand,
          ),
          clientView: null,
          timelineEvent: null,
        },
        visible: true,
      });
    }

    function collectRefreshHighlightTargets(outputText: string | null): void {
      const fromOutput = commandAction.refresh?.highlightTargetIdFromOutput;

      if (!fromOutput || !outputText) {
        return;
      }

      const match = outputText.match(new RegExp(fromOutput.pattern));

      if (!match) {
        return;
      }

      refreshHighlightTargetIds.push(
        expandHighlightTargetTemplate(fromOutput.template, match),
      );
    }

    function endUserPendingOnce(): void {
      if (!sourceId || userPendingEnded) {
        return;
      }

      userPendingEnded = true;

      if (pendingPresentation === 'entity' && sourceEntityKey) {
        adapters.endWebEntityPending(sourceId, sourceEntityKey);
      } else if (pendingPresentation !== 'none' && !runsInBackground) {
        adapters.endWebUiBusy(sourceId);
      }
    }

    function dispatchRefreshOnce({
      refreshStage,
    }: {
      refreshStage: 'prompt' | 'final';
    }): void {
      const refresh = commandAction.refresh;

      if (!refresh) {
        return;
      }

      if (refreshStage === 'prompt') {
        if (promptRefreshDispatchAttempted) {
          return;
        }

        promptRefreshDispatchAttempted = true;
      } else {
        if (finalRefreshDispatchAttempted) {
          return;
        }

        finalRefreshDispatchAttempted = true;
      }

      const refreshesTaskbar =
        refresh.target === 'taskbar' ||
        adapters.isTaskbarSubcommand(refresh.command, refresh.subcommand);

      const currentMeta = params?.getWebRoot?.().meta;

      const taskbarOptions = refreshesTaskbar
        ? adapters.getTaskbarDockValues(refresh.command, refresh.subcommand)
            ?.options
        : null;

      const inheritedOptions =
        taskbarOptions ??
        (currentMeta?.command === refresh.command &&
        currentMeta.subcommand === refresh.subcommand
          ? (currentMeta.options ?? {})
          : {});

      const refreshOptions = {
        ...inheritedOptions,
        ...(refresh.options ?? {}),
      };

      const refreshRecordTl = refresh.recordInTimeline ?? recordTl;

      if (!refreshesTaskbar && !params?.onReplaceRoot) {
        return;
      }

      const refreshRequestId = adapters.createId();
      let refreshRendered = false;

      refreshRoundTrip =
        browserTrace?.startSpan({
          name: `${commandAction.monitoring?.name ?? 'command'}.refresh-roundtrip`,
          attributes: {},
          parentSpanId: browserTrace.rootSpanId,
        }) ?? null;

      const refreshGeneration = sourceId
        ? beginRefreshGeneration(sourceId, endUserPendingOnce)
        : null;

      adapters.pendingRequests.set(refreshRequestId, {
        recordInTimeline: refreshRecordTl,
        onCommandResult: (refreshMessage) => {
          if (refreshStage === 'prompt' && finalRefreshDispatchAttempted) {
            return;
          }

          const refreshOutput = splitCommandOutput(refreshMessage.output);

          const highlightedWeb = refreshOutput.web
            ? highlightWebRootTargets(
                refreshOutput.web,
                refreshHighlightTargetIds,
              )
            : null;

          if (refreshesTaskbar) {
            if (
              sourceId &&
              refreshGeneration !== null &&
              refreshGenerationBySource.get(sourceId) !== refreshGeneration
            ) {
              return;
            }

            adapters.setTaskbarDockResult({
              command: refresh.command,
              subcommand: refresh.subcommand,
              values: {
                arguments: refresh.arguments ?? {},
                options: refreshOptions,
              },
              output: { ...refreshOutput, web: highlightedWeb },
              visible: true,
            });
          } else if (highlightedWeb) {
            refreshRendered = true;
            refreshRoundTrip?.end();

            const renderSpan = browserTrace?.startSpan({
              name: `${commandAction.monitoring?.name ?? 'command'}.frontend-render`,
              attributes: {},
              parentSpanId: browserTrace.rootSpanId,
            });

            const updateSpan = browserTrace?.startSpan({
              name: `${commandAction.monitoring?.name ?? 'command'}.frontend-update`,
              attributes: {},
              parentSpanId:
                renderSpan?.spanId ?? browserTrace?.rootSpanId ?? null,
            });

            params?.onReplaceRoot?.(highlightedWeb);
            updateSpan?.end();

            afterNextPaint(() => {
              renderSpan?.end();
              finishBrowserTrace('ok');
            });
          }
        },
        onDone: () => {
          emitStoryCommandCompleted({
            command: refresh.command,
            subcommand: refresh.subcommand,
          });

          if (sourceId && refreshGeneration !== null) {
            settleRefreshGeneration(sourceId, refreshGeneration);
          } else {
            endUserPendingOnce();
          }

          if (!refreshRendered) {
            finishBrowserTrace('ok');
          }
        },
        onError: () => {
          finishBrowserTrace('error');

          if (sourceId && refreshGeneration !== null) {
            settleRefreshGeneration(sourceId, refreshGeneration);
          } else {
            endUserPendingOnce();
          }
        },
      });

      try {
        adapters.sendSocketMessage({
          type: 'run_command',
          requestId: refreshRequestId,
          timelineId: adapters.timelineId(),
          command: refresh.command,
          subcommand: refresh.subcommand,
          payload: {
            arguments: refresh.arguments ?? {},
            options: refreshOptions,
          },
          recordInTimeline: refreshRecordTl,
          traceContext: browserTrace
            ? {
                traceId: browserTrace.traceId,
                parentSpanId:
                  refreshRoundTrip?.spanId ?? browserTrace.rootSpanId,
              }
            : undefined,
        });

        refreshChildInFlight = true;
      } catch (err) {
        adapters.pendingRequests.delete(refreshRequestId);
        finishBrowserTrace('error');

        adapters.appendSystemMessage(
          err instanceof Error ? err.message : String(err),
        );

        if (sourceId && refreshGeneration !== null) {
          settleRefreshGeneration(sourceId, refreshGeneration);
        } else {
          endUserPendingOnce();
        }
      }
    }

    adapters.pendingRequests.set(requestId, {
      recordInTimeline: recordTl,
      onCommandResult: (message) => {
        if (!commandRoundTripEnded) {
          commandRoundTripEnded = true;
          commandRoundTrip?.end();
        }

        if (typeof message.output === 'string') {
          const statusUpdate = parseBackgroundCommandStatus(message.output);

          if (statusUpdate) {
            setBackgroundCommandStatus(statusUpdate);

            return;
          }
        }

        const output = splitCommandOutput(message.output);
        collectRefreshHighlightTargets(output.text);

        if (runsInBackground && output.text) {
          backgroundOutputText = output.text;
        }

        const timelineEventItem = output.timelineEvent
          ? timelineEventOutputToItem(output.timelineEvent, adapters.createId())
          : null;

        if (timelineEventItem !== null) {
          adapters.setTimeline((prev) => [...prev, timelineEventItem]);

          dispatchRefreshOnce({ refreshStage: 'final' });

          if (!commandAction.refresh) {
            endUserPendingOnce();
          }

          return;
        }

        if (actionTargetsTaskbar) {
          adapters.setTaskbarDockResult({
            command: commandAction.command,
            subcommand: commandAction.subcommand,
            values: {
              arguments: commandAction.arguments ?? {},
              options: commandAction.options ?? {},
            },
            output,
            visible: true,
          });

          dispatchRefreshOnce({ refreshStage: 'final' });

          if (!commandAction.refresh) {
            endUserPendingOnce();
          }

          return;
        }

        const shouldRenderInTimeline =
          commandAction.surface === 'timeline' &&
          recordTl === false &&
          (output.clientView !== null || output.web !== null);

        if (recordTl || shouldRenderInTimeline) {
          adapters.setTimeline((prev) => [
            ...prev,
            {
              id: adapters.createId(),
              type: 'command_result',
              command: action.command,
              subcommand: commandAction.subcommand,
              subcommandTag: getResultSubcommandTag(
                commandAction.command,
                commandAction.subcommand,
                {
                  arguments: commandAction.arguments ?? {},
                  options: commandAction.options ?? {},
                },
              ),
              values: {
                arguments: commandAction.arguments ?? {},
                options: commandAction.options ?? {},
              },
              text: shouldRenderInTimeline ? null : output.text,
              web: output.web,
              clientView: output.clientView,
            },
          ]);
        } else if (
          output.text &&
          !suppressSystemMessage &&
          !commandAction.refresh &&
          !runsInBackground
        ) {
          adapters.appendSystemMessage(output.text);
        }

        if (
          params?.onReplaceRoot &&
          output.web &&
          !action.refresh &&
          !recordTl
        ) {
          params.onReplaceRoot(
            withInitialRevealedIds(output.web, commandAction.revealIds),
          );
        }

        dispatchRefreshOnce({ refreshStage: 'final' });

        if (!commandAction.refresh) {
          endUserPendingOnce();
        }
      },
      onPrompt: (message) => {
        const prompt = splitPromptPayload(message.prompt);

        dispatchRefreshOnce({ refreshStage: 'prompt' });

        adapters.setPendingPromptRequestId(message.requestId);

        // A prompt hands control back to the user, so the source widget should
        // stop showing its long-running busy overlay while waiting for input.
        if (!refreshChildInFlight) {
          endUserPendingOnce();
          finishBrowserTrace('ok');
        }

        if (!recordTl) {
          adapters.setChromePromptSession({
            requestId: message.requestId,
            prompt: message.prompt,
          });

          return;
        }

        adapters.setTimeline((prev) => [
          ...prev,
          {
            id: adapters.createId(),
            type: 'prompt',
            requestId: message.requestId,
            text: prompt.text,
            web: prompt.web,
          },
        ]);
      },
      onDone: () => {
        emitStoryCommandCompleted({
          command: commandAction.command,
          subcommand: commandAction.subcommand,
        });

        if (shouldRefreshComposerAiStateAfterDone) {
          void refreshComposerAiState();
        }

        if (
          shouldRefreshCoreUpdateState(
            commandAction.command,
            commandAction.subcommand,
          )
        ) {
          void adapters.refreshCoreUpdateState();
        }

        dispatchRefreshOnce({ refreshStage: 'final' });

        if (runsInBackground && commandAction.clientStatus?.success) {
          const successText = commandAction.clientStatus.success;

          const outputText =
            commandAction.clientStatus.successOutput === 'appendText'
              ? backgroundOutputText
              : null;

          if (statusTargetId) {
            setBackgroundCommandStatus({
              id: statusTargetId,
              state: 'success',
              message: successText,
              output: outputText,
              progress: 1,
            });
          }

          if (!statusTargetId) {
            adapters.appendSystemMessage(
              outputText ? `${successText}\n\n${outputText}` : successText,
            );
          }
        }

        if (!refreshChildInFlight) {
          endUserPendingOnce();
        }

        if (adapters.pendingPromptRequestId() === requestId) {
          adapters.setPendingPromptRequestId(null);
        }

        if (!recordTl) {
          adapters.setChromePromptSession(null);
        }
      },
      onError: () => {
        finishBrowserTrace('error');

        if (statusTargetId) {
          setBackgroundCommandStatus({
            id: statusTargetId,
            state: 'error',
            message: 'Background command failed.',
            output: null,
            progress: null,
          });
        }

        if (!refreshChildInFlight) {
          endUserPendingOnce();
        }

        if (adapters.pendingPromptRequestId() === requestId) {
          adapters.setPendingPromptRequestId(null);
        }

        if (!recordTl) {
          adapters.setChromePromptSession(null);
        }
      },
    });

    try {
      if (sourceId && pendingPresentation === 'entity' && sourceEntityKey) {
        adapters.beginWebEntityPending({
          sourceId,
          entityKey: sourceEntityKey,
          label: pendingLabel,
        });
      } else if (
        sourceId &&
        pendingPresentation !== 'none' &&
        !runsInBackground
      ) {
        if (pendingPresentation === 'entity' && import.meta.env.DEV) {
          console.debug(
            'Entity pending UI requested without a source entity; using widget pending UI.',
          );
        }

        adapters.beginWebUiBusy(sourceId);
      }

      adapters.sendSocketMessage({
        type: 'run_command',
        requestId,
        timelineId: adapters.timelineId(),
        command: action.command,
        subcommand: commandAction.subcommand,
        payload: {
          arguments: commandAction.arguments ?? {},
          options: commandAction.options ?? {},
        },
        recordInTimeline: recordTl,
        traceContext: browserTrace
          ? {
              traceId: browserTrace.traceId,
              parentSpanId: commandRoundTrip?.spanId ?? browserTrace.rootSpanId,
            }
          : undefined,
      });
    } catch (err) {
      clearPluginInstallRestartStatus();
      endUserPendingOnce();
      adapters.pendingRequests.delete(requestId);
      finishBrowserTrace('error');

      adapters.appendSystemMessage(
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  async function runCommand(
    command: string,
    subcommand: import('../types').CommandSubcommand,
    values: import('../types').CommandPayload,
  ): Promise<void> {
    const requestId = adapters.createId();
    const isTaskbar = adapters.isTaskbarSubcommand(command, subcommand.name);

    const loadingTimelineItemId =
      !isTaskbar && showsTimelineLoadingWidget(command, subcommand.name)
        ? adapters.createId()
        : null;

    const browserTrace = subcommand.monitoring
      ? createBrowserTrace({
          name: subcommand.monitoring.name,
          attributes: subcommand.monitoring.attributes,
        })
      : null;

    const roundTrip = browserTrace?.startSpan({
      name: `${subcommand.monitoring?.name ?? 'command'}.roundtrip`,
      attributes: {},
      parentSpanId: browserTrace.rootSpanId,
    });

    let resultReceived = false;
    let traceFinished = false;

    const finishTrace = (status: 'ok' | 'error'): void => {
      if (!browserTrace || traceFinished) {
        return;
      }

      traceFinished = true;
      roundTrip?.end(status);

      const spans = browserTrace.finish(status);

      adapters.sendSocketMessage({
        type: 'record_monitoring_spans',
        requestId: adapters.createId(),
        spans,
      });
    };

    if (isTaskbar) {
      adapters.setTaskbarDockResult({
        command,
        subcommand: subcommand.name,
        values,
        output: {
          text: null,
          web: taskbarLoadingWeb(command, subcommand.name),
          clientView: null,
          timelineEvent: null,
        },
        visible: true,
      });
    } else {
      adapters.setTimeline((prev) => {
        const next: TimelineItem[] = [
          ...prev,
          {
            id: adapters.createId(),
            type: 'chat',
            role: 'user',
            text: summarizeInvocation(command, subcommand.name, values),
          },
        ];

        if (loadingTimelineItemId) {
          next.push({
            id: loadingTimelineItemId,
            type: 'command_result',
            command,
            subcommand: subcommand.name,
            subcommandTag: getResultSubcommandTag(
              command,
              subcommand.name,
              values,
            ),
            values,
            text: null,
            web: taskbarLoadingWeb(command, subcommand.name),
            clientView: null,
          });
        }

        return next;
      });
    }

    adapters.pendingRequests.set(requestId, {
      recordInTimeline: !isTaskbar,
      onCommandResult: (message) => {
        resultReceived = true;
        roundTrip?.end();

        const output = splitCommandOutput(message.output);

        const renderSpan = browserTrace?.startSpan({
          name: `${subcommand.monitoring?.name ?? 'command'}.frontend-render`,
          attributes: {},
          parentSpanId: browserTrace.rootSpanId,
        });

        const updateSpan = browserTrace?.startSpan({
          name: `${subcommand.monitoring?.name ?? 'command'}.frontend-update`,
          attributes: {},
          parentSpanId: renderSpan?.spanId ?? browserTrace?.rootSpanId ?? null,
        });

        if (isTaskbar) {
          adapters.setTaskbarDockResult({
            command,
            subcommand: subcommand.name,
            values,
            output,
            visible: true,
          });
        } else {
          const resultItem: TimelineItem = {
            id: loadingTimelineItemId ?? adapters.createId(),
            type: 'command_result',
            command,
            subcommand: subcommand.name,
            subcommandTag: getResultSubcommandTag(
              command,
              subcommand.name,
              values,
            ),
            values,
            text: output.text,
            web: output.web,
            clientView: output.clientView,
          };

          adapters.setTimeline((prev) =>
            loadingTimelineItemId
              ? prev.map((item) =>
                  item.id === loadingTimelineItemId ? resultItem : item,
                )
              : [...prev, resultItem],
          );
        }

        updateSpan?.end();

        afterNextPaint(() => {
          renderSpan?.end();
          finishTrace('ok');
        });
      },
      onPrompt: (message) => {
        const prompt = splitPromptPayload(message.prompt);

        adapters.setPendingPromptRequestId(message.requestId);

        if (!isTaskbar) {
          adapters.setTimeline((prev) => [
            ...prev,
            {
              id: adapters.createId(),
              type: 'prompt',
              requestId: message.requestId,
              text: prompt.text,
              web: prompt.web,
            },
          ]);
        }
      },
      onDone: () => {
        if (!resultReceived) {
          finishTrace('ok');
        }

        if (shouldRefreshComposerAiState(command, subcommand.name)) {
          void refreshComposerAiState();
        }

        if (shouldRefreshCoreUpdateState(command, subcommand.name)) {
          void adapters.refreshCoreUpdateState();
        }

        if (adapters.pendingPromptRequestId() === requestId) {
          adapters.setPendingPromptRequestId(null);
        }
      },
      onError: () => {
        finishTrace('error');

        if (loadingTimelineItemId) {
          adapters.setTimeline((prev) =>
            prev.filter((item) => item.id !== loadingTimelineItemId),
          );
        }

        if (adapters.pendingPromptRequestId() === requestId) {
          adapters.setPendingPromptRequestId(null);
        }
      },
    });

    try {
      adapters.sendSocketMessage({
        type: 'run_command',
        requestId,
        timelineId: adapters.timelineId(),
        command,
        subcommand: subcommand.name,
        payload: values,
        recordInTimeline: !isTaskbar,
        traceContext: browserTrace
          ? {
              traceId: browserTrace.traceId,
              parentSpanId: roundTrip?.spanId ?? browserTrace.rootSpanId,
            }
          : undefined,
      });
    } catch (err) {
      adapters.pendingRequests.delete(requestId);
      finishTrace('error');

      adapters.appendSystemMessage(
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  function runJsonCommand(props: {
    command: string;
    subcommand: string;
    payload: unknown;
  }): Promise<string> {
    return runJsonCommandOutput(props).then(
      (output) => output.text ?? 'Saved.',
    );
  }

  function runJsonCommandOutput(props: {
    command: string;
    subcommand: string;
    payload: unknown;
  }): Promise<ReturnType<typeof splitCommandOutput>> {
    const requestId = adapters.createId();

    return new Promise((resolve, reject) => {
      adapters.pendingRequests.set(requestId, {
        recordInTimeline: false,
        onCommandResult: (message) => {
          const output = splitCommandOutput(message.output);
          resolve(output);
        },
        onDone: () => {
          emitStoryCommandCompleted({
            command: props.command,
            subcommand: props.subcommand,
          });
        },
        onError: (message) => reject(new Error(message.message)),
      });

      try {
        adapters.sendSocketMessage({
          type: 'json_command',
          requestId,
          timelineId: adapters.timelineId(),
          command: props.command,
          subcommand: props.subcommand,
          payload: props.payload,
          recordInTimeline: false,
        });
      } catch (err) {
        adapters.pendingRequests.delete(requestId);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  return {
    closeChromeModal,
    openChromeWidget,
    refreshComposerAiState,
    requestChromeCommand,
    runCommand,
    runJsonCommand,
    runJsonCommandOutput,
    runWebAction,
    splitCommandOutput,
  };
}
