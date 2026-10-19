import { createEffect, createSignal, For, Show } from 'solid-js';

import type { SessionRunView } from '@src/web/session-runs';

export type QueueAction =
  'pause' | 'continue' | 'dont_pause' | 'send_now' | 'edit' | 'remove';
export type QueueActionInput = {
  action: QueueAction;
  itemId: string | null;
  content: string | null;
};

type ComposerQueuePanelProps = {
  view: SessionRunView | undefined;
  disabled: boolean;
  pauseAvailable: boolean;
  onAction: (input: QueueActionInput) => Promise<boolean>;
  onStop: () => void;
};

export function ComposerQueuePanel(props: ComposerQueuePanelProps) {
  const [editing, setEditing] = createSignal<string | null>(null);
  const [draft, setDraft] = createSignal('');
  const [saving, setSaving] = createSignal(false);

  createEffect(() => {
    if (editing() && !props.view?.queue.some((item) => item.id === editing())) {
      setEditing(null);
    }
  });

  const phase = () => props.view?.phase ?? 'idle';
  const busy = () => props.disabled || saving() || phase() === 'stopping';

  const label = () =>
    ({
      idle: 'AI idle',
      working: 'AI working',
      pausing: 'Pausing after current step…',
      paused: props.view?.running ? 'AI paused' : 'AI idle · queue paused',
      stopping: 'Stopping AI…',
    })[phase()];

  return (
    <Show when={(props.view?.queue.length ?? 0) > 0}>
      <section class="composer-queue" aria-label="AI prompt queue">
        <div class="composer-queue__header">
          <span role="status">{label()}</span>
          <Show when={phase() === 'working' && props.pauseAvailable}>
            <button
              type="button"
              class="web-button"
              disabled={busy()}
              onClick={() =>
                void props.onAction({
                  action: 'pause',
                  itemId: null,
                  content: null,
                })
              }
            >
              Pause AI
            </button>
          </Show>
          <Show when={phase() === 'pausing' || phase() === 'paused'}>
            <button
              type="button"
              class="web-button"
              disabled={busy()}
              onClick={() =>
                void props.onAction({
                  action: phase() === 'pausing' ? 'dont_pause' : 'continue',
                  itemId: null,
                  content: null,
                })
              }
            >
              {phase() === 'pausing' ? "Don't pause" : 'Continue'}
            </button>
          </Show>
          <Show when={props.view?.running}>
            <button
              type="button"
              class="web-button"
              disabled={busy()}
              onClick={props.onStop}
            >
              Stop AI
            </button>
          </Show>
          <span class="composer-queue__count">
            · {props.view?.queue.length ?? 0} queued
          </span>
        </div>
        <For each={props.view?.queue.map((item) => item.id)}>
          {(id, index) => {
            const content = () =>
              props.view?.queue.find((item) => item.id === id)?.content ?? '';

            return (
              <div class="composer-queue__item">
                <Show
                  when={editing() === id}
                  fallback={
                    <>
                      <span class="composer-queue__text" title={content()}>
                        {index() + 1}. {content()}
                      </span>
                      <div class="composer-queue__actions">
                        <button
                          type="button"
                          class="web-button"
                          disabled={busy()}
                          onClick={() =>
                            void props.onAction({
                              action: 'send_now',
                              itemId: id,
                              content: null,
                            })
                          }
                        >
                          Send now
                        </button>
                        <button
                          type="button"
                          class="web-button"
                          disabled={busy()}
                          onClick={() => {
                            setDraft(content());
                            setEditing(id);
                          }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          class="web-button"
                          disabled={busy()}
                          onClick={() =>
                            void props.onAction({
                              action: 'remove',
                              itemId: id,
                              content: null,
                            })
                          }
                        >
                          Remove
                        </button>
                      </div>
                    </>
                  }
                >
                  <div class="composer-queue__editor">
                    <textarea
                      ref={(element) =>
                        queueMicrotask(() => {
                          if (element.isConnected && editing() === id) {
                            element.focus();
                          }
                        })
                      }
                      aria-label="Queued prompt"
                      value={draft()}
                      disabled={busy()}
                      onInput={(event) => setDraft(event.currentTarget.value)}
                    />
                    <div class="composer-queue__actions">
                      <button
                        type="button"
                        class="web-button"
                        disabled={busy() || !draft().trim()}
                        onClick={async () => {
                          setSaving(true);
                          try {
                            if (
                              await props.onAction({
                                action: 'edit',
                                itemId: id,
                                content: draft(),
                              })
                            ) {
                              setEditing(null);
                            }
                          } finally {
                            setSaving(false);
                          }
                        }}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        class="web-button"
                        disabled={saving()}
                        onClick={() => setEditing(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </Show>
              </div>
            );
          }}
        </For>
      </section>
    </Show>
  );
}
