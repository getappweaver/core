import type { JSX } from 'solid-js';
import { Show } from 'solid-js';

import { WebCommandOutputModal } from '../components/WebCommandOutputModal';
import { WebNodeShadowRoot } from '../components/WebNodeShadowRoot';
import { splitPromptPayload } from '../socket/dispatch';

import type { ChromeHook } from './types';
import {
  CHROME_WEB_COMMAND_SOURCE_ID,
  chromePromptWebCommandSourceId,
} from './useChrome';

type ChromeOverlayProps = {
  chrome: ChromeHook;
  currentUserPubkey: string | null;
  isWebUiBusy: (sourceId: string) => boolean;
  onClose: () => void;
  onRunWebAction: (
    action: import('@src/web/ui-schema').WebAction,
    params?: {
      onReplaceRoot?: (root: import('@src/web/ui-schema').WebNodeRoot) => void;
      promptRequestId?: string;
      uiExecutionPolicy?: {
        recordInTimeline?: boolean;
        suppressSystemMessage?: boolean;
      };
      webCommandSourceId?: string;
    },
  ) => void;
};

export function ChromeOverlay(props: ChromeOverlayProps): JSX.Element {
  return (
    <Show when={props.chrome.chromeModal() !== null}>
      <WebCommandOutputModal
        title={props.chrome.chromeModal()!.title}
        ariaLabel={props.chrome.chromeModal()!.title}
        onClose={props.onClose}
        loading={props.chrome.chromeLoading()}
        error={props.chrome.chromeError()}
        text={props.chrome.chromeText()}
        web={props.chrome.chromeWeb()}
        currentUserPubkey={props.currentUserPubkey}
        onReplaceWeb={(root) => props.chrome.setChromeWeb(root)}
        isWebUiBusy={props.isWebUiBusy}
        chromeWebCommandSourceId={CHROME_WEB_COMMAND_SOURCE_ID}
        onRunWebAction={(action, params) =>
          props.onRunWebAction(action, {
            ...params,
            uiExecutionPolicy: {
              ...params?.uiExecutionPolicy,
              recordInTimeline: false,
            },
            webCommandSourceId: CHROME_WEB_COMMAND_SOURCE_ID,
          })
        }
        chromePromptOverlay={() => {
          const session = props.chrome.chromePromptSession();

          if (session === null) {
            return null;
          }

          const payload = splitPromptPayload(session.prompt);

          const promptSourceId = chromePromptWebCommandSourceId(
            session.requestId,
          );

          return (
            <div class="chrome-prompt-panel">
              <Show when={payload.text !== null && payload.text !== ''}>
                <pre class="status-modal-text">{payload.text}</pre>
              </Show>
              <Show when={payload.web !== null}>
                <div class="status-modal-web">
                  <WebNodeShadowRoot
                    root={payload.web!}
                    promptRequestId={session.requestId}
                    currentUserPubkey={props.currentUserPubkey}
                    busy={props.isWebUiBusy(promptSourceId)}
                    onRunAction={(action, params) =>
                      props.onRunWebAction(action, {
                        ...params,
                        uiExecutionPolicy: {
                          ...params?.uiExecutionPolicy,
                          recordInTimeline: false,
                        },
                        webCommandSourceId: promptSourceId,
                      })
                    }
                  />
                </div>
              </Show>
              <p class="chrome-prompt-hint muted">
                Reply in the composer and press Enter.
              </p>
            </div>
          );
        }}
      />
    </Show>
  );
}
