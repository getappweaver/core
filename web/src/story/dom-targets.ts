const targets = new Map<string, Set<HTMLElement>>();

export function registerStoryDomTarget(
  targetId: string,
  el: HTMLElement | null,
): void {
  if (!el) {
    targets.delete(targetId);

    return;
  }

  const existing = targets.get(targetId);

  if (existing) {
    existing.add(el);

    return;
  }

  targets.set(targetId, new Set([el]));
}

function isVisibleTarget(el: HTMLElement): boolean {
  if (!el.isConnected) {
    return false;
  }

  const rect = el.getBoundingClientRect();

  return rect.width > 0 && rect.height > 0;
}

function pruneDisconnected(targetId: string, elements: Set<HTMLElement>): void {
  for (const el of elements) {
    if (!el.isConnected) {
      elements.delete(el);
    }
  }

  if (elements.size === 0) {
    targets.delete(targetId);
  }
}

export function getStoryDomTarget(targetId: string): HTMLElement | null {
  const elements = targets.get(targetId);

  if (!elements) {
    return null;
  }

  pruneDisconnected(targetId, elements);

  const visibleTarget = [...elements].find(isVisibleTarget);

  if (visibleTarget) {
    return visibleTarget;
  }

  const connectedTarget = [...elements].find((el) => el.isConnected);

  return connectedTarget ?? null;
}
