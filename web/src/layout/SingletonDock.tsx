import type { Accessor, JSX } from 'solid-js';
import { For, Show, createMemo } from 'solid-js';

import { TimelineCommandResultCard } from '../components/timeline/TimelineCommandResultCard';
import type { TimelineViewProps } from '../components/timeline/types';
import type { TimelineItem } from '../types';

import { resolveWidgetIconUrl, type WidgetIconSource } from './widgetIcons';

export type SingletonWidgetEntry = {
  itemId: string;
  visible: boolean;
};

export type TaskbarWidget = WidgetIconSource & {
  command: string;
  subcommand: string;
  surface: 'modal' | 'timeline_singleton';
  label: string;
  modalTitle: string;
  order?: number;
};

export type DockedWidgetCard = {
  key: string;
  widget: TaskbarWidget;
  entry: SingletonWidgetEntry;
  item: Extract<TimelineItem, { type: 'command_result' }>;
};

type SingletonDockProps = {
  taskbarWidgets: Accessor<TaskbarWidget[]>;
  dockedWidgetCards: Accessor<DockedWidgetCard[]>;
  taskbarSingletonByKey: Accessor<Record<string, SingletonWidgetEntry>>;
  expandedDockWidgetKeys: Accessor<string[]>;
  wsConnected: Accessor<boolean>;
  currentUserPubkey: Accessor<string | null>;
  dockResizable: Accessor<boolean>;
  taskbarDockKey: (command: string, subcommand: string) => string;
  onToggleTaskbarWidget: (widget: TaskbarWidget) => void;
  onDockCardElement: (key: string, el: HTMLElement) => void;
  onOpenCommand: TimelineViewProps['onOpenCommand'];
  onRepeatSubcommand: TimelineViewProps['onRepeatSubcommand'];
  onCloseTaskbarWidget: (command: string, subcommand: string) => void;
  onReplaceCommandWeb: TimelineViewProps['onReplaceCommandWeb'];
  isWebUiBusy: TimelineViewProps['isWebUiBusy'];
  getWebEntityPending: TimelineViewProps['getWebEntityPending'];
  onRunWebAction: TimelineViewProps['onRunWebAction'];
  onRunJsonCommand: TimelineViewProps['onRunJsonCommand'];
  onAppendSystem: TimelineViewProps['onAppendSystem'];
  onToggleExpandedDockWidget: (key: string) => void;
  onExpandDockWidget: (key: string) => void;
  onCollapseDockWidget: (key: string) => void;
  onStartDockResize: (event: PointerEvent) => void;
};

export function SingletonDock(props: SingletonDockProps): JSX.Element {
  const dockCardKeys = createMemo(() =>
    props.dockedWidgetCards().map((card) => card.key),
  );

  const dockCardsByKey = createMemo(
    () => new Map(props.dockedWidgetCards().map((card) => [card.key, card])),
  );

  const isExpanded = (key: string) =>
    props.expandedDockWidgetKeys().includes(key);

  return (
    <>
      <aside class="singleton-dock" aria-label="Singleton widgets">
        <div class="singleton-dock__header">
          <span>Widgets</span>
          <div class="singleton-dock__buttons" role="toolbar">
            <For each={props.taskbarWidgets()}>
              {(widget) => {
                const key = () =>
                  props.taskbarDockKey(widget.command, widget.subcommand);

                const entry = () => props.taskbarSingletonByKey()[key()];
                const iconUrl = () => resolveWidgetIconUrl(widget);

                return (
                  <button
                    type="button"
                    class="singleton-dock__button"
                    data-story-target={`header-widget:${key()}`}
                    classList={{
                      'singleton-dock__button--open': entry() !== undefined,
                      'singleton-dock__button--active': isExpanded(key()),
                    }}
                    disabled={!props.wsConnected()}
                    onClick={() => props.onToggleTaskbarWidget(widget)}
                    title={
                      props.wsConnected()
                        ? `${widget.label} (/${widget.command} ${widget.subcommand})`
                        : 'Connect Nostr first — waiting for WebSocket'
                    }
                    aria-label={widget.label}
                  >
                    <Show when={iconUrl()} fallback={widget.label.slice(0, 1)}>
                      {(url) => (
                        <img
                          class="singleton-dock__button-icon"
                          src={url()}
                          alt=""
                          aria-hidden="true"
                        />
                      )}
                    </Show>
                  </button>
                );
              }}
            </For>
          </div>
        </div>
        <div class="singleton-dock__cards">
          <Show
            when={dockCardKeys().length > 0}
            fallback={
              <div class="singleton-dock__placeholder">
                Open a widget to keep it here while you chat.
              </div>
            }
          >
            <For each={dockCardKeys()}>
              {(cardKey) => (
                <DockCardSlot
                  card={() => dockCardsByKey().get(cardKey) ?? null}
                  dockProps={props}
                  isExpanded={isExpanded}
                />
              )}
            </For>
          </Show>
        </div>
      </aside>
      <Show when={props.dockResizable()}>
        <div
          class="workspace-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize widget dock"
          onPointerDown={props.onStartDockResize}
        />
      </Show>
    </>
  );
}

type DockCardSlotProps = {
  card: Accessor<DockedWidgetCard | null>;
  dockProps: SingletonDockProps;
  isExpanded: (key: string) => boolean;
};

function DockCardSlot(props: DockCardSlotProps): JSX.Element {
  const dockProps = props.dockProps;

  return (
    <Show when={props.card()}>
      {(dockCard) => (
        <section
          class="singleton-dock-card"
          classList={{
            'singleton-dock-card--focused': props.isExpanded(dockCard().key),
            'singleton-dock-card--active': props.isExpanded(dockCard().key),
          }}
          tabIndex={-1}
          ref={(el) => dockProps.onDockCardElement(dockCard().key, el)}
        >
          <div class="singleton-dock-card__body">
            <TimelineCommandResultCard
              item={dockCard().item}
              iconUrl={resolveWidgetIconUrl(dockCard().widget)}
              onOpenCommand={dockProps.onOpenCommand}
              onRepeatSubcommand={dockProps.onRepeatSubcommand}
              onDeleteTimelineItem={() =>
                dockProps.onCloseTaskbarWidget(
                  dockCard().widget.command,
                  dockCard().widget.subcommand,
                )
              }
              onReplaceCommandWeb={dockProps.onReplaceCommandWeb}
              isWebUiBusy={dockProps.isWebUiBusy}
              getWebEntityPending={dockProps.getWebEntityPending}
              onRunWebAction={dockProps.onRunWebAction}
              onRunJsonCommand={dockProps.onRunJsonCommand}
              onAppendSystem={dockProps.onAppendSystem}
              currentUserPubkey={dockProps.currentUserPubkey()}
              renderSurface="dock"
              collapsed={!props.isExpanded(dockCard().key)}
              onHeadClick={() =>
                dockProps.onToggleExpandedDockWidget(dockCard().key)
              }
              onCollapsedChange={(collapsed) => {
                if (collapsed) {
                  dockProps.onCollapseDockWidget(dockCard().key);

                  return;
                }

                dockProps.onExpandDockWidget(dockCard().key);
              }}
            />
          </div>
        </section>
      )}
    </Show>
  );
}
