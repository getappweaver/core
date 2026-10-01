import {
  createMemo,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
} from 'solid-js';

import type { AppWeaverSession } from '@src/session';

type ComposerContextMenuButtonProps = {
  backend: string;
  label: string;
  estimated: boolean;
  wsConnected: boolean;
  compacting: boolean;
  sessionDiffAvailable: boolean;
  currentSessionId: string | null;
  currentSessionTitle: string | null;
  recentSessions: AppWeaverSession[];
  onCompact: () => void;
  onCreateNewSession: () => void;
  onShowSessionDiff: () => void;
  onRenameSession: (title: string) => void;
  onSelectSession: (sessionId: string) => void;
};

export function ComposerContextMenuButton(
  props: ComposerContextMenuButtonProps,
) {
  const [open, setOpen] = createSignal(false);
  const [renaming, setRenaming] = createSignal(false);
  const [draftTitle, setDraftTitle] = createSignal('');
  let root: HTMLDivElement | undefined;

  onMount(() => {
    function onDocPointerDown(event: PointerEvent): void {
      if (!open()) {
        return;
      }

      const t = event.target;

      if (root && t instanceof Node && !root.contains(t)) {
        setOpen(false);
      }
    }

    function onDocKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape' && open()) {
        setOpen(false);
      }
    }

    document.addEventListener('pointerdown', onDocPointerDown, true);
    document.addEventListener('keydown', onDocKeyDown, true);

    onCleanup(() => {
      document.removeEventListener('pointerdown', onDocPointerDown, true);
      document.removeEventListener('keydown', onDocKeyDown, true);
    });
  });

  const showCompact = () => props.backend === 'opencode';

  const buttonLabel = () =>
    props.compacting ? `Compacting… ${props.label}` : props.label;

  const recentSessions = createMemo(() => {
    const current = props.currentSessionId;

    return [
      ...(current
        ? [{ id: current, title: props.currentSessionTitle, updatedAt: 0 }]
        : []),
      ...(props.recentSessions ?? [])
        .filter((session) => session.id !== current)
        .slice(0, 4),
    ];
  });

  const displayTitle = (session: AppWeaverSession) => {
    const title = session.title || `Session ${session.id.slice(0, 8)}`;
    const characters = Array.from(title);

    return characters.length > 30
      ? `${characters.slice(0, 29).join('')}…`
      : title;
  };

  return (
    <div
      class="composer-meta-dropdown composer-meta-dropdown--context"
      ref={root}
    >
      <button
        type="button"
        class="composer-meta-text composer-meta-text--muted composer-meta-text--context"
        classList={{ 'is-compacting': props.compacting }}
        disabled={!props.wsConnected}
        aria-expanded={open()}
        aria-haspopup="menu"
        title={
          props.wsConnected
            ? props.estimated
              ? 'Estimated from session text; token usage was not reported. Click for session context actions.'
              : 'Session context actions'
            : 'Connect WebSocket first'
        }
        onClick={() => setOpen((v) => !v)}
      >
        {buttonLabel()}
      </button>
      <Show when={open()}>
        <div class="web-overflow-panel is-flip-up" role="menu">
          <div class="composer-session-menu-heading">Sessions</div>
          <For each={recentSessions()}>
            {(session) => (
              <button
                type="button"
                role="menuitem"
                class="web-button composer-session-menu-item"
                title={session.title ?? undefined}
                aria-current={
                  session.id === props.currentSessionId ? 'true' : undefined
                }
                onClick={() => {
                  setOpen(false);
                  props.onSelectSession(session.id);
                }}
              >
                {session.id === props.currentSessionId ? '✓ ' : ''}
                {displayTitle(session)}
              </button>
            )}
          </For>
          <Show when={renaming()}>
            <form
              class="composer-session-rename"
              onSubmit={(event) => {
                event.preventDefault();
                const title = draftTitle().trim();

                if (!title) {
                  return;
                }

                setRenaming(false);
                setOpen(false);
                props.onRenameSession(title);
              }}
            >
              <input
                aria-label="Session title"
                value={draftTitle()}
                maxLength={120}
                onInput={(event) => setDraftTitle(event.currentTarget.value)}
              />
              <button type="submit" class="web-button">
                Save
              </button>
            </form>
          </Show>
          <button
            type="button"
            role="menuitem"
            class="web-button"
            disabled={!props.currentSessionId}
            onClick={() => {
              setDraftTitle(props.currentSessionTitle ?? '');
              setRenaming((value) => !value);
            }}
          >
            Rename session
          </button>
          <Show when={showCompact()}>
            <button
              type="button"
              role="menuitem"
              class="web-button"
              disabled={props.compacting}
              onClick={() => {
                if (props.compacting) {
                  return;
                }

                setOpen(false);
                props.onCompact();
              }}
            >
              {props.compacting ? 'Compacting…' : 'Compact'}
            </button>
          </Show>
          <button
            type="button"
            role="menuitem"
            class="web-button"
            disabled={!props.sessionDiffAvailable}
            onClick={() => {
              setOpen(false);
              props.onShowSessionDiff();
            }}
          >
            Show session changes
          </button>
          <button
            type="button"
            role="menuitem"
            class="web-button"
            onClick={() => {
              setOpen(false);
              props.onCreateNewSession();
            }}
          >
            Create new session
          </button>
        </div>
      </Show>
    </div>
  );
}
