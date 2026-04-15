// ---------------------------------------------------------------------------
// web/src/components/WebNodeShadowRoot.tsx — Shadow DOM island for WebNodeRoot
// ---------------------------------------------------------------------------

import { createEffect, createSignal, onCleanup, onMount } from 'solid-js';
import { render } from 'solid-js/web';
import type { JSX } from 'solid-js';

import type { WebAction, WebNodeRoot, WebStyleSheet } from '@src/web/ui-schema';

import baseWebUiCss from '../webview/base-web-ui.css?raw';
import hljsGithubDarkCss from 'highlight.js/styles/github-dark.css?raw';
import { WebNodeRenderer } from './WebNodeRenderer';

type WebNodeShadowRootProps = {
  root: WebNodeRoot;
  onReplaceRoot?: (root: WebNodeRoot) => void;
  onError?: (message: string) => void;
  promptRequestId?: string;
  onRunAction?: (
    action: WebAction,
    params?: {
      onReplaceRoot?: (root: WebNodeRoot) => void;
      promptRequestId?: string;
    },
  ) => void;
};

const BASE_STYLE_TEXT = `${baseWebUiCss}\n${hljsGithubDarkCss}`;

type ShadowMountContext = {
  shadow: ShadowRoot;
  mount: HTMLDivElement;
};

type SyncPayloadStylesheetsProps = {
  shadow: ShadowRoot;
  mount: HTMLElement;
  stylesheets: WebStyleSheet[] | undefined;
};

function syncPayloadStylesheets(props: SyncPayloadStylesheetsProps): void {
  const { shadow, mount, stylesheets } = props;
  const desired = new Map<string, string>();

  for (const sheet of stylesheets ?? []) {
    desired.set(sheet.id, sheet.cssText);
  }

  for (const el of [...shadow.querySelectorAll('style[data-web-sheet]')]) {
    const id = el.getAttribute('data-web-sheet');

    if (!id || !desired.has(id)) {
      el.remove();
    }
  }

  for (const [id, cssText] of desired) {
    const existing = [...shadow.querySelectorAll('style[data-web-sheet]')].find(
      (e) => e.getAttribute('data-web-sheet') === id,
    );

    if (existing) {
      if (existing.textContent !== cssText) {
        existing.textContent = cssText;
      }
    } else {
      const style = document.createElement('style');
      style.setAttribute('data-web-sheet', id);
      style.textContent = cssText;
      shadow.insertBefore(style, mount);
    }
  }
}

export function WebNodeShadowRoot(props: WebNodeShadowRootProps): JSX.Element {
  let hostEl: HTMLDivElement | undefined;
  const [ctx, setCtx] = createSignal<ShadowMountContext | null>(null);

  onMount(() => {
    const host = hostEl;

    if (!host) {
      return;
    }

    const shadow = host.attachShadow({ mode: 'open' });

    const baseStyle = document.createElement('style');
    baseStyle.setAttribute('data-web-base', '');
    baseStyle.textContent = BASE_STYLE_TEXT;

    const mount = document.createElement('div');
    shadow.append(baseStyle, mount);
    setCtx({ shadow, mount });
  });

  createEffect(() => {
    const c = ctx();

    if (!c) {
      return;
    }

    const root = props.root;
    const onReplaceRoot = props.onReplaceRoot;
    const onError = props.onError;
    const promptRequestId = props.promptRequestId;
    const onRunAction = props.onRunAction;

    syncPayloadStylesheets({
      shadow: c.shadow,
      mount: c.mount,
      stylesheets: root.stylesheets,
    });

    const mountScrollY = root.shadowMountOverflow !== 'hidden';

    c.mount.className = mountScrollY
      ? 'web-shadow-mount web-shadow-mount--scroll-y'
      : 'web-shadow-mount';

    const dispose = render(
      () => (
        <WebNodeRenderer
          root={root}
          onReplaceRoot={onReplaceRoot}
          onError={onError}
          promptRequestId={promptRequestId}
          onRunAction={onRunAction}
        />
      ),
      c.mount,
    );

    onCleanup(() => {
      dispose();
    });
  });

  return (
    <div
      class="web-ui-shadow-host"
      ref={(el) => {
        hostEl = el;
      }}
    />
  );
}
