import type { TimelineAdapters, TimelineHook } from './types';

export function appendSystemMessageToTimeline(
  setTimeline: TimelineAdapters['setTimeline'],
  createId: TimelineAdapters['createId'],
  text: string,
): void {
  setTimeline((prev) => [...prev, { id: createId(), type: 'system', text }]);
}

export function useTimeline(adapters: TimelineAdapters): TimelineHook {
  function appendSystemMessage(text: string): void {
    appendSystemMessageToTimeline(
      adapters.setTimeline,
      adapters.createId,
      text,
    );
  }

  function saveTimelineForm(
    item: Extract<import('../types').TimelineItem, { type: 'command_form' }>,
  ): void {
    const requestId = adapters.createId();

    adapters.pendingRequests.set(requestId, {});

    try {
      adapters.sendSocketMessage({
        type: 'save_timeline_form',
        requestId,
        timelineId: adapters.timelineId(),
        eventId: item.id,
        command: item.command,
        form: {
          subcommand: item.subcommand,
          values: item.values,
          autoRun: item.autoRun,
          ...(item.optionHints ? { optionHints: item.optionHints } : {}),
          ...(item.argumentChoices
            ? { argumentChoices: item.argumentChoices }
            : {}),
        },
      });
    } catch (err) {
      adapters.pendingRequests.delete(requestId);
      appendSystemMessage(err instanceof Error ? err.message : String(err));
    }
  }

  function deleteTimelineItem(itemId: string): void {
    adapters.setTimeline((prev) => prev.filter((item) => item.id !== itemId));

    const requestId = adapters.createId();
    adapters.pendingRequests.set(requestId, {});

    try {
      adapters.sendSocketMessage({
        type: 'delete_timeline_event',
        requestId,
        timelineId: adapters.timelineId(),
        eventId: itemId,
      });
    } catch (err) {
      adapters.pendingRequests.delete(requestId);
      appendSystemMessage(err instanceof Error ? err.message : String(err));
    }
  }

  function replaceCommandResultWeb(
    itemId: string,
    web: import('@src/web/ui-schema').WebNodeRoot,
  ): void {
    adapters.setTimeline((prev) =>
      prev.map((entry) =>
        entry.id === itemId && entry.type === 'command_result'
          ? { ...entry, web, text: null }
          : entry,
      ),
    );
  }

  function updateFormValue(
    itemId: string,
    source: 'arguments' | 'options',
    name: string,
    value: unknown,
  ): void {
    adapters.setTimeline((prev) => {
      const form = prev.find(
        (
          entry,
        ): entry is Extract<
          import('../types').TimelineItem,
          { type: 'command_form' }
        > => entry.type === 'command_form' && entry.id === itemId,
      );

      if (!form) {
        return prev;
      }

      form.values[source][name] = value;
      saveTimelineForm(form);

      return [...prev];
    });
  }

  async function submitForm(itemId: string): Promise<void> {
    const item = adapters.timeline().find((entry) => entry.id === itemId);

    if (!item || item.type !== 'command_form') {
      return;
    }

    adapters.setActiveFormId(null);

    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    await adapters.runCommand(item.command, item.subcommand, item.values);
  }

  async function repeatTimelineSubcommand(
    item: Extract<
      import('../types').TimelineItem,
      { type: 'command_result' | 'command_form' }
    >,
  ): Promise<void> {
    if (item.type === 'command_form') {
      await adapters.runCommand(item.command, item.subcommand, item.values);

      return;
    }

    const command = adapters.resolveCommandDetail(item.command);

    const subcommand = command?.subcommands.find(
      (entry) => entry.name === item.subcommand,
    );

    if (!command || !subcommand) {
      appendSystemMessage(
        `Unable to rerun /${item.command} ${item.subcommand}`,
      );

      return;
    }

    await adapters.runCommand(
      item.command,
      subcommand,
      item.values ?? adapters.defaultPayload(subcommand),
    );
  }

  return {
    appendSystemMessage,
    deleteTimelineItem,
    repeatTimelineSubcommand,
    replaceCommandResultWeb,
    saveTimelineForm,
    submitForm,
    updateFormValue,
  };
}
