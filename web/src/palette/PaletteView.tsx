import type { JSX } from 'solid-js';
import { createEffect, For, on, Show } from 'solid-js';

import { WebButton } from '../components/WebButton';
import type { CommandSubcommand } from '../types';

import type { PaletteHook } from './types';

type PaletteViewProps = {
  palette: PaletteHook;
  loadingCommands: boolean;
  notConnected: boolean;
  onChooseSubcommand: (subcommand: CommandSubcommand) => void;
};

export function PaletteView(props: PaletteViewProps): JSX.Element {
  let inputEl: HTMLInputElement | undefined;
  let containerEl: HTMLDivElement | undefined;

  createEffect(
    on(
      [
        props.palette.paletteOpen,
        props.palette.paletteStep,
        props.palette.paletteSelectedIndex,
      ],
      ([open]) => {
        if (!open) {
          return;
        }

        queueMicrotask(() => {
          containerEl
            ?.querySelector<HTMLButtonElement>('.palette-item.selected')
            ?.scrollIntoView({ block: 'nearest' });
        });
      },
    ),
  );

  createEffect(
    on([props.palette.paletteOpen, props.palette.paletteStep], ([open]) => {
      if (!open) {
        return;
      }

      queueMicrotask(() => inputEl?.focus());
    }),
  );

  return (
    <Show when={props.palette.paletteOpen()}>
      <div class="palette-backdrop" onClick={props.palette.closePalette}>
        <div
          class="palette panel"
          ref={containerEl}
          onClick={(event) => event.stopPropagation()}
        >
          <div class="palette-topbar">
            <div class="palette-header">
              <div class="palette-breadcrumbs">
                <button
                  type="button"
                  class="palette-crumb"
                  onClick={props.palette.goPaletteRoot}
                >
                  /
                </button>
                <Show
                  when={
                    props.palette.paletteStep() === 'subcommands' &&
                    props.palette.selectedCommand()
                  }
                >
                  <>
                    <span class="palette-crumb-sep"> </span>
                    <button
                      type="button"
                      class="palette-crumb"
                      onClick={props.palette.goPaletteCommandLevel}
                    >
                      {props.palette.selectedCommand()?.name}
                    </button>
                  </>
                </Show>
              </div>
              <WebButton
                type="button"
                class="close-btn"
                onClick={props.palette.closePalette}
              >
                x
              </WebButton>
            </div>

            <input
              class="palette-filter"
              ref={inputEl}
              value={props.palette.paletteQuery()}
              onInput={(event) =>
                void props.palette.handlePaletteFilterInput(
                  event.currentTarget.value,
                )
              }
              onKeyDown={props.palette.handlePaletteKeyDown}
              placeholder={
                props.palette.paletteStep() === 'commands'
                  ? 'Filter commands'
                  : 'Filter subcommands'
              }
            />
          </div>

          <div class="palette-body">
            <Show when={props.palette.paletteError()}>
              {(message) => <p class="error-text">{message()}</p>}
            </Show>

            <Show when={props.palette.paletteStep() === 'commands'}>
              <Show
                when={!props.notConnected}
                fallback={
                  <p class="muted">
                    Connect a Nostr signer to browse commands.
                  </p>
                }
              >
                <Show
                  when={!props.loadingCommands}
                  fallback={<p class="muted">Loading commands...</p>}
                >
                  <div class="palette-list compact-list">
                    <For each={props.palette.filteredCommands()}>
                      {(command, index) => (
                        <WebButton
                          type="button"
                          class={`palette-item ${props.palette.paletteSelectedIndex() === index() ? 'selected' : ''}`}
                          onClick={() =>
                            void props.palette.chooseCommand(command.name)
                          }
                        >
                          <span class="palette-name">
                            {command.name}{' '}
                            <Show when={command.source === 'plugin'}>
                              <span class="muted">[{command.source}]</span>
                            </Show>
                          </span>
                          <span class="palette-summary">{command.summary}</span>
                        </WebButton>
                      )}
                    </For>
                  </div>
                </Show>
              </Show>
            </Show>

            <Show
              when={
                props.palette.paletteStep() === 'subcommands' &&
                props.palette.selectedCommand()
              }
            >
              <div class="palette-list compact-list">
                <For each={props.palette.filteredSubcommands()}>
                  {(subcommand, index) => (
                    <WebButton
                      type="button"
                      class={`palette-item ${props.palette.paletteSelectedIndex() === index() ? 'selected' : ''}`}
                      onClick={() => props.onChooseSubcommand(subcommand)}
                    >
                      <span class="palette-name">
                        {props.palette.selectedCommand()?.name === 'help'
                          ? subcommand.usage.replace(/^topic\s+/, '')
                          : subcommand.name}
                      </span>
                      <span class="palette-summary">{subcommand.summary}</span>
                      <code class="palette-usage">
                        /{props.palette.selectedCommand()?.name}{' '}
                        {props.palette.selectedCommand()?.name === 'help'
                          ? subcommand.usage.replace(/^topic\s+/, '')
                          : subcommand.usage}
                      </code>
                    </WebButton>
                  )}
                </For>
              </div>
            </Show>
          </div>
        </div>
      </div>
    </Show>
  );
}
