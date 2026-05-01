const targets = new Map<string, HTMLElement>();

export function registerStoryDomTarget(
  targetId: string,
  el: HTMLElement | null,
): void {
  if (el) {
    targets.set(targetId, el);
  } else {
    targets.delete(targetId);
  }
}

export function getStoryDomTarget(targetId: string): HTMLElement | null {
  return targets.get(targetId) ?? null;
}
