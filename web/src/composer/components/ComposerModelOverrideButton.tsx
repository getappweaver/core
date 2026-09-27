import {
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
  Show,
} from 'solid-js';
import { Portal } from 'solid-js/web';

import { buildModelPickerTree } from '@src/web/model-picker';
import type { WebAction, WebNodeRoot } from '@src/web/ui-schema';

import type { ComposerAiState, RunWebActionParams } from '../../commands/types';
import { WebNodeShadowRoot } from '../../components/WebNodeShadowRoot';

type Props = {
  state: ComposerAiState | null;
  wsConnected: boolean;
  modelStateUnavailable: boolean;
  onRequestState: () => void;
  onRunWebAction: (action: WebAction, params?: RunWebActionParams) => void;
};

export function ComposerModelOverrideButton(props: Props) {
  const [open, setOpen] = createSignal(false);
  const [openWhenLoaded, setOpenWhenLoaded] = createSignal(false);
  const [changingTo, setChangingTo] = createSignal<string | null>(null);

  const [position, setPosition] = createSignal({
    left: 12,
    bottom: 12,
    width: 448,
    maxHeight: 480,
  });

  let root: HTMLDivElement | undefined;
  let trigger: HTMLButtonElement | undefined;
  let panel: HTMLDivElement | undefined;

  const modelLabel = () => {
    if (changingTo()) {
      return `Changing to ${changingTo()}...`;
    }

    if (!props.state) {
      return props.modelStateUnavailable
        ? 'Model unavailable'
        : 'Loading model...';
    }

    if (props.state.modelSource.state.transitionState === 'pending') {
      return `Loading ${props.state.modelSource.state.title}...`;
    }

    if (
      props.state.modelSource.state.transitionState === 'failed' ||
      props.state.modelSource.state.health.status === 'unavailable'
    ) {
      return `${props.state.modelSource.state.title} unavailable`;
    }

    return props.state.modelSource.state.effectiveModelId || 'Choose model';
  };

  const updatePosition = () => {
    if (!open() || !trigger) {
      return;
    }

    const rect = trigger.getBoundingClientRect();
    const gutter = 12;
    const gap = 6;
    const width = Math.min(448, window.innerWidth - gutter * 2);

    setPosition({
      left: Math.min(
        Math.max(gutter, rect.right - width),
        window.innerWidth - width - gutter,
      ),
      bottom: window.innerHeight - rect.top + gap,
      width,
      maxHeight: Math.max(160, rect.top - gutter - gap),
    });
  };

  const tree = createMemo<WebNodeRoot | null>(() =>
    props.state
      ? {
          kind: 'ui',
          version: 1,
          meta: { command: 'ai', subcommand: 'models' },
          tree: {
            type: 'element',
            tag: 'stack',
            props: { gap: 'sm' },
            children: [
              {
                type: 'element',
                tag: 'text',
                props: { weight: 'semibold' },
                children: [{ type: 'text', value: 'Model source' }],
              },
              {
                type: 'element',
                tag: 'row',
                props: { gap: 'sm' },
                children: props.state.modelSources.map((source) => ({
                  type: 'element' as const,
                  tag: 'button' as const,
                  props: {
                    label: `${source.title} (${source.alias})${source.active ? ' ✓' : ''}`,
                    disabled: changingTo() !== null,
                    title:
                      source.health.status === 'healthy'
                        ? `Use ${source.title}`
                        : source.health.message,
                    className: `model-picker__source${source.active ? ' is-selected' : ''}`,
                    action: {
                      type: 'command' as const,
                      command: 'ai',
                      subcommand: 'source',
                      arguments: { source: source.providerId },
                      options: {},
                      recordInTimeline: false,
                    },
                  },
                })),
              },
              buildModelPickerTree(props.state.modelSource),
            ],
          },
        }
      : null,
  );

  onMount(() => {
    const close = (event: PointerEvent) => {
      if (
        open() &&
        event.target instanceof Node &&
        !root?.contains(event.target) &&
        !panel?.contains(event.target)
      ) {
        setOpen(false);
      }
    };

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        trigger?.focus();
      }
    };

    document.addEventListener('pointerdown', close, true);
    document.addEventListener('keydown', closeOnEscape, true);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    onCleanup(() => {
      document.removeEventListener('pointerdown', close, true);
      document.removeEventListener('keydown', closeOnEscape, true);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    });
  });

  createEffect(() => {
    if (open()) {
      queueMicrotask(updatePosition);
    }
  });

  createEffect(() => {
    if (props.state && openWhenLoaded()) {
      setOpenWhenLoaded(false);
      setOpen(true);
    }
  });

  createEffect(() => {
    if (!props.wsConnected) {
      setChangingTo(null);
      setOpen(false);
    }
  });

  return (
    <div class="composer-meta-dropdown" ref={root}>
      <button
        type="button"
        ref={trigger}
        class="composer-chip composer-chip--model-override"
        disabled={!props.wsConnected || changingTo() !== null}
        aria-expanded={open()}
        aria-haspopup="dialog"
        aria-live="polite"
        title={
          props.state &&
          !changingTo() &&
          props.state.modelSource.state.health.status !== 'healthy'
            ? (props.state.modelSource.state.health.message ?? modelLabel())
            : modelLabel()
        }
        onClick={() => {
          if (!props.state) {
            setOpenWhenLoaded(true);
            props.onRequestState();

            return;
          }

          setOpen((value) => !value);
        }}
      >
        {modelLabel()}
      </button>
      <Portal>
        <Show when={open() && tree() !== null}>
          <div
            ref={panel}
            class="composer-model-picker"
            role="dialog"
            aria-label="Choose AI model"
            style={{
              left: `${position().left}px`,
              bottom: `${position().bottom}px`,
              width: `${position().width}px`,
              'max-height': `${position().maxHeight}px`,
            }}
          >
            <WebNodeShadowRoot
              root={tree()!}
              stateScopeId={`composer-models:${props.state!.modelSource.providerId}`}
              onRunAction={(action, params) => {
                const switchingSource =
                  action.type === 'command' &&
                  action.command === 'ai' &&
                  action.subcommand === 'source';

                if (switchingSource) {
                  const source = props.state?.modelSources.find(
                    (option) => option.providerId === action.arguments?.source,
                  );

                  setChangingTo(source?.alias ?? 'model source');
                }

                const suppressResult =
                  action.type === 'command' &&
                  action.command === 'ai' &&
                  (action.subcommand === 'models' ||
                    action.subcommand === 'favorite' ||
                    action.subcommand === 'unfavorite');

                props.onRunWebAction(action, {
                  ...params,
                  ...(switchingSource
                    ? { onCommandSettled: () => setChangingTo(null) }
                    : {}),
                  uiExecutionPolicy: {
                    ...params?.uiExecutionPolicy,
                    suppressSystemMessage:
                      suppressResult ||
                      params?.uiExecutionPolicy?.suppressSystemMessage,
                  },
                });
              }}
            />
          </div>
        </Show>
      </Portal>
    </div>
  );
}
