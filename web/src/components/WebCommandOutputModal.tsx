// ---------------------------------------------------------------------------
// web/src/components/WebCommandOutputModal.tsx — generic WebNode / text output
// ---------------------------------------------------------------------------

import type { JSX } from 'solid-js';
import { createSignal, Show } from 'solid-js';

import type { WebAction, WebNodeRoot } from '@src/web/ui-schema';

import type {
  RunWebActionParams,
  WebEntityPendingState,
} from '../commands/types';
import {
  ComposerFilePicker,
  type FilePickerTransport,
} from '../composer/components/ComposerFilePicker';

import { WebButton } from './WebButton';
import { WebNodeShadowRoot } from './WebNodeShadowRoot';

type WebCommandOutputModalProps = {
  title: string;
  iconUrl?: string | null;
  ariaLabel: string;
  onClose: () => void;
  filePickerTransport: FilePickerTransport;
  loading: boolean;
  error: string | null;
  text: string | null;
  web: WebNodeRoot | null;
  currentUserPubkey: string | null;
  onReplaceWeb: (root: WebNodeRoot) => void;
  isWebUiBusy: (sourceId: string) => boolean;
  getWebEntityPending: (
    sourceId: string,
    entityKey: string,
  ) => WebEntityPendingState;
  chromeWebCommandSourceId: string;
  onRunWebAction: (action: WebAction, params?: RunWebActionParams) => void;
  /** When set, a prompt from a chrome command is shown above the main body. */
  chromePromptOverlay?: () => JSX.Element | null;
};

export function WebCommandOutputModal(
  props: WebCommandOutputModalProps,
): JSX.Element {
  const [fileSuggestionInput, setFileSuggestionInput] =
    createSignal<HTMLTextAreaElement | null>(null);

  function insertFilePath(value: string): void {
    const input = fileSuggestionInput();

    if (!input) {
      return;
    }

    input.value = value;

    // The picker restores the selection in a microtask after insertion.
    // Notify the textarea after that so its query sees the new cursor position.
    requestAnimationFrame(() => {
      if (input.isConnected) {
        input.dispatchEvent(new InputEvent('input', { bubbles: true }));
      }
    });
  }

  function handleBackdropClick(e: MouseEvent): void {
    if (e.target === e.currentTarget) {
      props.onClose();
    }
  }

  function handleKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      props.onClose();
    }
  }

  return (
    <div
      class="modal-backdrop"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-label={props.ariaLabel}
    >
      <div class="modal panel status-modal-panel">
        <div class="modal-header">
          <span class="modal-title modal-title--with-icon">
            <Show when={props.iconUrl}>
              {(iconUrl) => (
                <img
                  src={iconUrl()}
                  alt=""
                  aria-hidden="true"
                  class="modal-title-icon"
                />
              )}
            </Show>
            <span>{props.title}</span>
          </span>
          <WebButton
            type="button"
            class="close-btn"
            onClick={props.onClose}
            aria-label="Close"
          >
            ✕
          </WebButton>
        </div>

        <div class="modal-body status-modal-body">
          {props.chromePromptOverlay?.()}

          <Show when={props.loading}>
            <p class="status-modal-loading">Loading…</p>
          </Show>

          <Show when={!props.loading && props.error}>
            <p class="status-modal-error" role="alert">
              {props.error}
            </p>
          </Show>

          <Show when={!props.loading && !props.error && props.web}>
            {(getWeb) => (
              <div class="status-modal-web">
                <WebNodeShadowRoot
                  root={getWeb()}
                  renderSurface="modal"
                  currentUserPubkey={props.currentUserPubkey}
                  busy={props.isWebUiBusy(props.chromeWebCommandSourceId)}
                  getEntityPending={(entityKey) =>
                    props.getWebEntityPending(
                      props.chromeWebCommandSourceId,
                      entityKey,
                    )
                  }
                  onRunAction={(action, params) =>
                    props.onRunWebAction(action, {
                      ...params,
                      onReplaceRoot: props.onReplaceWeb,
                    })
                  }
                  onReplaceRoot={props.onReplaceWeb}
                  onFileSuggestionInput={setFileSuggestionInput}
                />
              </div>
            )}
          </Show>

          <Show when={fileSuggestionInput()}>
            <ComposerFilePicker
              {...props.filePickerTransport}
              textareaRef={() => fileSuggestionInput() ?? undefined}
              composerText={() => fileSuggestionInput()?.value ?? ''}
              setComposerText={insertFilePath}
              floating
            />
          </Show>

          <Show
            when={
              !props.loading &&
              !props.error &&
              !props.web &&
              props.text !== null &&
              props.text !== ''
            }
          >
            <pre class="status-modal-text">{props.text}</pre>
          </Show>

          <Show
            when={
              !props.loading &&
              !props.error &&
              !props.web &&
              (props.text === null || props.text === '')
            }
          >
            <p class="status-modal-empty muted">(no output)</p>
          </Show>
        </div>
      </div>
    </div>
  );
}
