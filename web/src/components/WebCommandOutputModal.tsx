// ---------------------------------------------------------------------------
// web/src/components/WebCommandOutputModal.tsx — generic WebNode / text output
// ---------------------------------------------------------------------------

import type { JSX } from 'solid-js';
import { Show } from 'solid-js';

import type { WebAction, WebNodeRoot } from '@src/web/ui-schema';

import { WebButton } from './WebButton';
import { WebNodeShadowRoot } from './WebNodeShadowRoot';

type WebCommandOutputModalProps = {
  title: string;
  ariaLabel: string;
  onClose: () => void;
  loading: boolean;
  error: string | null;
  text: string | null;
  web: WebNodeRoot | null;
  currentUserPubkey: string | null;
  onReplaceWeb: (root: WebNodeRoot) => void;
  isWebUiBusy: (sourceId: string) => boolean;
  chromeWebCommandSourceId: string;
  onRunWebAction: (
    action: WebAction,
    params?: {
      onReplaceRoot?: (root: WebNodeRoot) => void;
      promptRequestId?: string;
      uiExecutionPolicy?: {
        recordInTimeline?: boolean;
        suppressSystemMessage?: boolean;
      };
      webCommandSourceId?: string;
    },
  ) => void;
  /** When set, a prompt from a chrome command is shown above the main body. */
  chromePromptOverlay?: () => JSX.Element | null;
};

export function WebCommandOutputModal(
  props: WebCommandOutputModalProps,
): JSX.Element {
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
          <span class="modal-title">{props.title}</span>
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
                  onRunAction={(action, params) =>
                    props.onRunWebAction(action, {
                      ...params,
                      onReplaceRoot: (root) => {
                        params?.onReplaceRoot?.(root);
                        props.onReplaceWeb(root);
                      },
                    })
                  }
                  onReplaceRoot={props.onReplaceWeb}
                />
              </div>
            )}
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
