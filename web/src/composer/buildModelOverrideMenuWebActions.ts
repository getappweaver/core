import type { WebAction } from '@src/web/ui-schema';

import type { ComposerAiState } from '../commands/types';

export type ModelOverrideMenuWebActions = {
  setOrChange: Extract<WebAction, { type: 'command' }>;
  clearOverride: Extract<WebAction, { type: 'command' }>;
  setOrChangeLabel: string;
};

/**
 * Same command actions as bot status “Override model” (`modelMenuItems` in status web renderer).
 */
export function buildModelOverrideMenuWebActions(
  state: ComposerAiState,
): ModelOverrideMenuWebActions {
  const hasOverride =
    state.modelOverride != null && state.modelOverride.length > 0;

  const setOrChange: Extract<WebAction, { type: 'command' }> = {
    type: 'command',
    command: 'ai',
    subcommand: 'model',
    arguments: {
      name_or_reset: state.modelOverride ?? '',
    },
    options: {},
    presentation: 'form',
    ...(state.opencodeModelFormChoices.length > 0
      ? { argumentChoices: { name_or_reset: state.opencodeModelFormChoices } }
      : {}),
  };

  const clearOverride: Extract<WebAction, { type: 'command' }> = {
    type: 'command',
    command: 'ai',
    subcommand: 'model',
    arguments: { name_or_reset: 'reset' },
    options: {},
  };

  return {
    setOrChange,
    clearOverride,
    setOrChangeLabel: hasOverride ? 'Change override' : 'Set override',
  };
}
