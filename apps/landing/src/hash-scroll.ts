function hashTargetId(): string | null {
  const hash = window.location.hash;

  if (!hash || hash === '#') {
    return null;
  }

  try {
    return decodeURIComponent(hash.slice(1));
  } catch {
    return hash.slice(1);
  }
}

export function scrollStageToHash(root: HTMLElement): boolean {
  const targetId = hashTargetId();

  if (!targetId) {
    return false;
  }

  const target = document.getElementById(targetId);

  if (!(target instanceof HTMLElement) || !root.contains(target)) {
    return false;
  }

  const rootRect = root.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const scrollMarginTop = Number.parseFloat(
    window.getComputedStyle(target).scrollMarginTop,
  );

  root.scrollTo({
    top:
      root.scrollTop +
      targetRect.top -
      rootRect.top -
      (Number.isFinite(scrollMarginTop) ? scrollMarginTop : 0),
    left: 0,
  });

  return true;
}

export function scheduleStageHashScroll(
  root: HTMLElement,
  onScrolled: () => void,
): () => void {
  let firstFrameId: number | null = null;
  let secondFrameId: number | null = null;

  firstFrameId = window.requestAnimationFrame(() => {
    firstFrameId = null;
    secondFrameId = window.requestAnimationFrame(() => {
      secondFrameId = null;

      if (scrollStageToHash(root)) {
        onScrolled();
      }
    });
  });

  return () => {
    if (firstFrameId !== null) {
      window.cancelAnimationFrame(firstFrameId);
    }

    if (secondFrameId !== null) {
      window.cancelAnimationFrame(secondFrameId);
    }
  };
}
