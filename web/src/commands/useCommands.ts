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
} from '@src/web/ui-schema';

import { getEditableTextSnapshot } from '../editableTextRegistry';
import type { NostrInteractionRecordResult } from '../nostr/interactionState';
import { handleNostrLikeEventAction } from '../nostr/likeEventAction';
import {
  handleNostrFollowProfileAction,
  handleNostrOpenProfilePanelAction,
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
  }

  function runWebAction(
    action: import('@src/web/ui-schema').WebAction,
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
                  onReplaceRoot: params.onReplaceRoot,
                  promptRequestId: params.promptRequestId,
                  uiExecutionPolicy: { recordInTimeline: false },
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

      if (clientActionName === 'web.openUrl') {
        const url =
          typeof action.payload.url === 'string' ? action.payload.url : '';

        if (url.length > 0) {
          const opened = window.open(url, '_blank', 'noopener,noreferrer');

          if (!opened) {
            window.location.href = url;
          }
        }
      } else if (clientActionName === 'web.copyText') {
        const text =
          typeof action.payload.text === 'string' ? action.payload.text : '';

        if (text.length > 0) {
          void navigator.clipboard.writeText(text).catch(() => {
            adapters.appendSystemMessage('Unable to copy text to clipboard.');
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
              onReplaceRoot: params?.onReplaceRoot,
              promptRequestId: params?.promptRequestId,
              uiExecutionPolicy: {
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
    const runsInBackground = commandAction.clientStatus?.background === true;

    if (statusTargetId && commandAction.clientStatus?.pending) {
      setBackgroundCommandStatus({
        id: statusTargetId,
        state: 'pending',
        message: commandAction.clientStatus.pending,
        output: null,
        progress: null,
      });
    }

    let refreshChildInFlight = false;
    let promptRefreshDispatchAttempted = false;
    let finalRefreshDispatchAttempted = false;
    let userBusyEnded = false;
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

    function endUserWebUiBusyOnce(): void {
      if (!sourceId || userBusyEnded) {
        return;
      }

      userBusyEnded = true;
      adapters.endWebUiBusy(sourceId);
    }

    function dispatchRefreshOnce(refreshStage: 'prompt' | 'final'): void {
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

      const refreshesTaskbar = adapters.isTaskbarSubcommand(
        refresh.command,
        refresh.subcommand,
      );

      const refreshRecordTl = refresh.recordInTimeline ?? recordTl;

      if (!refreshesTaskbar && !params?.onReplaceRoot) {
        return;
      }

      const refreshRequestId = adapters.createId();

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
            adapters.setTaskbarDockResult({
              command: refresh.command,
              subcommand: refresh.subcommand,
              values: {
                arguments: refresh.arguments ?? {},
                options: refresh.options ?? {},
              },
              output: { ...refreshOutput, web: highlightedWeb },
              visible: true,
            });
          } else if (highlightedWeb) {
            params?.onReplaceRoot?.(highlightedWeb);
          }
        },
        onDone: () => {
          emitStoryCommandCompleted({
            command: refresh.command,
            subcommand: refresh.subcommand,
          });

          endUserWebUiBusyOnce();
        },
        onError: () => {
          endUserWebUiBusyOnce();
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
            options: refresh.options ?? {},
          },
          recordInTimeline: refreshRecordTl,
        });

        refreshChildInFlight = true;
      } catch (err) {
        adapters.pendingRequests.delete(refreshRequestId);

        adapters.appendSystemMessage(
          err instanceof Error ? err.message : String(err),
        );
      }
    }

    adapters.pendingRequests.set(requestId, {
      recordInTimeline: recordTl,
      onCommandResult: (message) => {
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

          dispatchRefreshOnce('final');

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

          dispatchRefreshOnce('final');

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

        dispatchRefreshOnce('final');
      },
      onPrompt: (message) => {
        const prompt = splitPromptPayload(message.prompt);

        dispatchRefreshOnce('prompt');

        adapters.setPendingPromptRequestId(message.requestId);

        // A prompt hands control back to the user, so the source widget should
        // stop showing its long-running busy overlay while waiting for input.
        endUserWebUiBusyOnce();

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

        dispatchRefreshOnce('final');

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
          endUserWebUiBusyOnce();
        }

        if (adapters.pendingPromptRequestId() === requestId) {
          adapters.setPendingPromptRequestId(null);
        }

        if (!recordTl) {
          adapters.setChromePromptSession(null);
        }
      },
      onError: () => {
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
          endUserWebUiBusyOnce();
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
      if (sourceId && !runsInBackground) {
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
      });
    } catch (err) {
      clearPluginInstallRestartStatus();
      endUserWebUiBusyOnce();
      adapters.pendingRequests.delete(requestId);

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
      adapters.setTimeline((prev) => [
        ...prev,
        {
          id: adapters.createId(),
          type: 'chat',
          role: 'user',
          text: summarizeInvocation(command, subcommand.name, values),
        },
      ]);
    }

    adapters.pendingRequests.set(requestId, {
      recordInTimeline: !isTaskbar,
      onCommandResult: (message) => {
        const output = splitCommandOutput(message.output);

        if (isTaskbar) {
          adapters.setTaskbarDockResult({
            command,
            subcommand: subcommand.name,
            values,
            output,
            visible: true,
          });
        } else {
          adapters.setTimeline((prev) => [
            ...prev,
            {
              id: adapters.createId(),
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
            },
          ]);
        }
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
      });
    } catch (err) {
      adapters.pendingRequests.delete(requestId);

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
