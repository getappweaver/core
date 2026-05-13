import type {
  TimelineEventOutput,
  WebNode,
  WebNodeRoot,
} from '@src/web/ui-schema';

import { handleRoadmapCommentIssue } from '../roadmap/commentIssue';
import { handleRoadmapCreateIssue } from '../roadmap/createIssue';
import { handleRoadmapLightningZap } from '../roadmap/lightningZap';
import {
  handleRoadmapDeleteIssue,
  handleRoadmapMarkIssue,
} from '../roadmap/markIssue';
import { splitCommandOutput, splitPromptPayload } from '../socket/dispatch';
import { emitStoryCommandCompleted } from '../story/events';
import type { TimelineItem } from '../types';
import { getResultSubcommandTag, summarizeInvocation } from '../utils';

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
): WebNode {
  if (node.type !== 'element') {
    return node;
  }

  const shouldHighlight =
    (node.props?.id !== undefined && targetIds.has(node.props.id)) ||
    (node.props?.storyTargetId !== undefined &&
      targetIds.has(node.props.storyTargetId));

  return {
    ...node,
    props: shouldHighlight
      ? {
          ...node.props,
          className: appendClassName(
            node.props?.className,
            'web-highlight-flash',
          ),
        }
      : node.props,
    summary: node.summary
      ? highlightWebNodeTargets(node.summary, targetIds)
      : undefined,
    children: node.children?.map((child) =>
      highlightWebNodeTargets(child, targetIds),
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
    tree: highlightWebNodeTargets(root.tree, new Set(targetIds)),
  };
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
  }): void {
    adapters.setChromeModal({
      command: props.command,
      subcommand: props.subcommand,
      title: props.title,
    });

    requestChromeCommand({
      command: props.command,
      subcommand: props.subcommand,
      title: props.title,
      payload: { arguments: {}, options: {} },
    });
  }

  function closeChromeModal(): void {
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

      const runClientAction = (actionPromise: Promise<void>): void => {
        void actionPromise.then(() => {
          const refresh = action.refresh;

          if (!refresh || !params?.onReplaceRoot) {
            return;
          }

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
      };

      if (clientActionName === 'roadmap.lightningZap') {
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
      } else {
        adapters.appendSystemMessage(
          `Unknown client action: ${JSON.stringify(action.action)}`,
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

    const requestId = adapters.createId();
    const uiExecutionPolicy = params?.uiExecutionPolicy;

    const recordTl =
      commandAction.recordInTimeline ??
      uiExecutionPolicy?.recordInTimeline ??
      true;

    const suppressSystemMessage =
      uiExecutionPolicy?.suppressSystemMessage ?? false;

    const shouldRefreshComposerAiStateAfterDone = shouldRefreshComposerAiState(
      commandAction.command,
      commandAction.subcommand,
    );

    const sourceId = params?.webCommandSourceId;

    let refreshChildInFlight = false;
    let promptRefreshDispatchAttempted = false;
    let finalRefreshDispatchAttempted = false;
    let userBusyEnded = false;

    const refreshHighlightTargetIds = [
      ...(commandAction.refresh?.highlightTargetIds ?? []),
    ];

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

      if (!refreshesTaskbar && !params?.onReplaceRoot) {
        return;
      }

      const refreshRequestId = adapters.createId();

      adapters.pendingRequests.set(refreshRequestId, {
        recordInTimeline: recordTl,
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
          recordInTimeline: recordTl,
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
        const output = splitCommandOutput(message.output);
        collectRefreshHighlightTargets(output.text);

        const timelineEventItem = output.timelineEvent
          ? timelineEventOutputToItem(output.timelineEvent, adapters.createId())
          : null;

        if (timelineEventItem !== null) {
          adapters.setTimeline((prev) => [...prev, timelineEventItem]);

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
              web: shouldRenderInTimeline ? null : output.web,
              clientView: output.clientView,
            },
          ]);
        } else if (
          output.text &&
          !suppressSystemMessage &&
          !commandAction.refresh
        ) {
          adapters.appendSystemMessage(output.text);
        }

        if (
          params?.onReplaceRoot &&
          output.web &&
          !action.refresh &&
          !recordTl
        ) {
          params.onReplaceRoot(output.web);
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

        dispatchRefreshOnce('final');

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
      if (sourceId) {
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
    const requestId = adapters.createId();

    return new Promise((resolve, reject) => {
      adapters.pendingRequests.set(requestId, {
        recordInTimeline: false,
        onCommandResult: (message) => {
          const output = splitCommandOutput(message.output);
          resolve(output.text ?? 'Saved.');
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
    runWebAction,
    splitCommandOutput,
  };
}
