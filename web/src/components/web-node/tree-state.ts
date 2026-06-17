import type { WebAction } from '@src/web/ui-schema';

import { writeClipboardText } from '../../utils/clipboard';

import type {
  TreeFilterState,
  WebRevealContextValue,
  WebToggleContextValue,
} from './contexts';

// ---------------------------------------------------------------------------
// Tree item expanded state (module-level cache, keyed by scope id)
// ---------------------------------------------------------------------------

const treeItemExpandedByScope = new Map<string, Map<string, boolean>>();

export function getTreeItemExpandedStateForScope(
  scopeId: string | undefined,
): Map<string, boolean> {
  if (!scopeId) {
    return new Map<string, boolean>();
  }

  const existing = treeItemExpandedByScope.get(scopeId);

  if (existing) {
    return existing;
  }

  const created = new Map<string, boolean>();
  treeItemExpandedByScope.set(scopeId, created);

  return created;
}

export function clearTreeItemExpandedStateForScope(scopeId: string): void {
  treeItemExpandedByScope.delete(scopeId);
}

// ---------------------------------------------------------------------------
// Action helpers
// ---------------------------------------------------------------------------

export function expandTreeItemsForAction(
  action: WebAction,
  expandedById: Map<string, boolean> | undefined,
  expandTreeItems: ((ids: string[]) => void) | undefined,
): void {
  if (expandedById === undefined) {
    return;
  }

  if (action.type === 'reveal' || action.type === 'toggleReveal') {
    const ids = action.expandTreeItemIds ?? [];

    for (const id of ids) {
      expandedById.set(id, true);
    }

    expandTreeItems?.(ids);

    return;
  }

  if (action.type !== 'command') {
    return;
  }

  const ids = action.refresh?.expandTreeItemIds ?? [];

  for (const id of ids) {
    expandedById.set(id, true);
  }

  expandTreeItems?.(ids);

  const fromOption = action.refresh?.expandTreeItemIdFromOption;

  if (fromOption === undefined) {
    return;
  }

  const value = action.options?.[fromOption.option];

  if (typeof value === 'string' && value.length > 0) {
    const id = fromOption.template.replace('$1', value);

    expandedById.set(id, true);
    expandTreeItems?.([id]);
  }
}

type RunLocalWebActionProps = {
  action: WebAction;
  expandedById: Map<string, boolean> | undefined;
  expandTreeItems: ((ids: string[]) => void) | undefined;
  revealContext: WebRevealContextValue | undefined;
  toggleContext: WebToggleContextValue | undefined;
  filterState: TreeFilterState | undefined;
};

export function runLocalWebAction({
  action,
  expandedById,
  expandTreeItems,
  revealContext,
  toggleContext,
  filterState,
}: RunLocalWebActionProps): boolean {
  expandTreeItemsForAction(action, expandedById, expandTreeItems);

  if (action.type === 'reveal') {
    revealContext?.reveal(action.targetId);

    return true;
  }

  if (action.type === 'hideReveal') {
    revealContext?.hideReveal(action.targetId);

    return true;
  }

  if (action.type === 'toggleReveal') {
    revealContext?.toggleReveal(action.targetId);

    return true;
  }

  if (action.type === 'clientAction') {
    const clientActionName = action.action.trim();

    if (clientActionName === 'clipboard.writeText') {
      const text = action.payload?.text;

      if (typeof text === 'string') {
        void writeClipboardText(text).catch(() => {});
      }

      return true;
    }

    if (clientActionName === 'web.toggle') {
      const key = action.payload?.key;

      if (typeof key === 'string' && key.length > 0) {
        toggleContext?.toggle(key);
      }

      return true;
    }

    if (clientActionName === 'web.setTreeFilter') {
      const value = action.payload?.value;

      if (typeof value === 'string') {
        filterState?.setValue(value);
      }

      return true;
    }

    if (clientActionName === 'web.toggleTreeFilter') {
      const value = action.payload?.value;

      if (typeof value === 'string') {
        const current = filterState?.query().trim().toLowerCase() ?? '';
        const next = value.trim();

        filterState?.setValue(current === next.toLowerCase() ? '' : next);
      }

      return true;
    }

    if (clientActionName === 'editableText.runCommand') {
      // Let the command runner read the mounted editable node before any
      // refresh/toggle can unmount it. The refreshed command result will leave
      // edit mode once save succeeds.
      return false;
    }
  }

  return false;
}
