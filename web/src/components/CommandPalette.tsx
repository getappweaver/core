import { For, Show } from 'solid-js';

import type { CommandDetail, CommandSubcommand } from '../types';

type CommandPaletteProps = {
  open: boolean;
  step: 'commands' | 'subcommands';
  query: string;
  error: string | null;
  loadingCommands: boolean;
  notConnected: boolean;
  selectedCommand: CommandDetail | null;
  filteredCommands: CommandDetail[];
  filteredSubcommands: CommandSubcommand[];
  selectedIndex: number;
  setInputRef?: (el: HTMLInputElement) => void;
  setContainerRef?: (el: HTMLDivElement) => void;
  onClose: () => void;
  onGoRoot: () => void;
  onGoCommandLevel: () => void;
  onInput: (value: string) => void;
  onKeyDown: (
    event: KeyboardEvent & { currentTarget: HTMLInputElement; target: Element },
  ) => void;
  onChooseCommand: (name: string) => void;
  onChooseSubcommand: (subcommand: CommandSubcommand) => void;
};

export function CommandPalette(props: CommandPaletteProps) {
  return (
    <Show when={props.open}>
      <div class="palette-backdrop" onClick={props.onClose}>
        <div
          class="palette panel"
          ref={(el) => props.setContainerRef?.(el)}
          onClick={(event) => event.stopPropagation()}
        >
          <div class="palette-topbar">
            <div class="palette-header">
              <div class="palette-breadcrumbs">
                <button
                  type="button"
                  class="palette-crumb"
                  onClick={props.onGoRoot}
                >
                  /
                </button>
                <Show
                  when={props.step === 'subcommands' && props.selectedCommand}
                >
                  <>
                    <span class="palette-crumb-sep"> </span>
                    <button
                      type="button"
                      class="palette-crumb"
                      onClick={props.onGoCommandLevel}
                    >
                      {props.selectedCommand?.name}
                    </button>
                  </>
                </Show>
              </div>
              <button type="button" class="close-btn" onClick={props.onClose}>
                x
              </button>
            </div>

            <input
              class="palette-filter"
              ref={(el) => props.setInputRef?.(el)}
              value={props.query}
              onInput={(event) => props.onInput(event.currentTarget.value)}
              onKeyDown={props.onKeyDown}
              placeholder={
                props.step === 'commands'
                  ? 'Filter commands'
                  : 'Filter subcommands'
              }
            />
          </div>

          <div class="palette-body">
            <Show when={props.error}>
              {(message) => <p class="error-text">{message()}</p>}
            </Show>

            <Show when={props.step === 'commands'}>
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
                    <For each={props.filteredCommands}>
                      {(command, index) => (
                        <button
                          type="button"
                          class={`palette-item ${props.selectedIndex === index() ? 'selected' : ''}`}
                          onClick={() => props.onChooseCommand(command.name)}
                        >
                          <span class="palette-name">
                            {command.name}{' '}
                            <Show when={command.source === 'plugin'}>
                              <span class="muted">[{command.source}]</span>
                            </Show>
                          </span>
                          <span class="palette-summary">{command.summary}</span>
                        </button>
                      )}
                    </For>
                  </div>
                </Show>
              </Show>
            </Show>

            <Show when={props.step === 'subcommands' && props.selectedCommand}>
              <div class="palette-list compact-list">
                <For each={props.filteredSubcommands}>
                  {(subcommand, index) => (
                    <button
                      type="button"
                      class={`palette-item ${props.selectedIndex === index() ? 'selected' : ''}`}
                      onClick={() => props.onChooseSubcommand(subcommand)}
                    >
                      <span class="palette-name">
                        {props.selectedCommand?.name === 'help'
                          ? subcommand.usage.replace(/^topic\s+/, '')
                          : subcommand.name}
                      </span>
                      <span class="palette-summary">{subcommand.summary}</span>
                      <code class="palette-usage">
                        /{props.selectedCommand?.name}{' '}
                        {props.selectedCommand?.name === 'help'
                          ? subcommand.usage.replace(/^topic\s+/, '')
                          : subcommand.usage}
                      </code>
                    </button>
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
