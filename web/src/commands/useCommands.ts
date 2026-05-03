import type { TimelineFileDiff } from '@src/timeline/types';

import { splitCommandOutput, splitPromptPayload } from '../socket/dispatch';
import { emitStoryCommandCompleted } from '../story/events';
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
      'agent-set',
      'backend',
      'mode',
      'model',
      'provider',
      'root-model',
    ].includes(subcommand)
  );
}

function timelineDiffClientViewFiles(
  payload: unknown,
): TimelineFileDiff[] | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const files = (payload as { files?: unknown }).files;

  if (!Array.isArray(files)) {
    return null;
  }

  return files.filter((file): file is TimelineFileDiff => {
    if (!file || typeof file !== 'object') {
      return false;
    }

    const rec = file as Record<string, unknown>;

    return typeof rec.file === 'string' && typeof rec.patch === 'string';
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
      openChromeWidget({
        command: commandAction.command,
        subcommand: commandAction.subcommand,
        title: commandAction.modalTitle ?? 'Command Output',
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
    let refreshDispatchAttempted = false;
    let userBusyEnded = false;

    function endUserWebUiBusyOnce(): void {
      if (!sourceId || userBusyEnded) {
        return;
      }

      userBusyEnded = true;
      adapters.endWebUiBusy(sourceId);
    }

    function dispatchRefreshOnce(): void {
      const refresh = commandAction.refresh;

      if (!refresh || refreshDispatchAttempted) {
        return;
      }

      const refreshesTaskbar = adapters.isTaskbarSubcommand(
        refresh.command,
        refresh.subcommand,
      );

      if (!refreshesTaskbar && !params?.onReplaceRoot) {
        return;
      }

      refreshDispatchAttempted = true;

      const refreshRequestId = adapters.createId();

      adapters.pendingRequests.set(refreshRequestId, {
        recordInTimeline: recordTl,
        onCommandResult: (refreshMessage) => {
          const refreshOutput = splitCommandOutput(refreshMessage.output);

          if (refreshesTaskbar) {
            adapters.setTaskbarDockResult({
              command: refresh.command,
              subcommand: refresh.subcommand,
              values: {
                arguments: refresh.arguments ?? {},
                options: refresh.options ?? {},
              },
              output: refreshOutput,
              visible: true,
            });
          } else if (refreshOutput.web) {
            params?.onReplaceRoot?.(refreshOutput.web);
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

        const timelineDiffFiles =
          output.clientView?.view === 'timeline-diff'
            ? timelineDiffClientViewFiles(output.clientView.payload)
            : null;

        if (timelineDiffFiles !== null) {
          adapters.setTimeline((prev) => [
            ...prev,
            {
              id: adapters.createId(),
              type: 'diff',
              files: timelineDiffFiles,
            },
          ]);

          dispatchRefreshOnce();

          return;
        }

        const shouldRenderInTimeline =
          commandAction.surface === 'timeline' &&
          output.clientView !== null &&
          recordTl === false;

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

        dispatchRefreshOnce();
      },
      onPrompt: (message) => {
        const prompt = splitPromptPayload(message.prompt);

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

        dispatchRefreshOnce();

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

    if (!isTaskbar) {
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
