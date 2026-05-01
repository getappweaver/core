/**
 * Whether `.web-tree-header` still intersects the timeline viewport region *below* the sticky card head.
 * When it does not, callers can show duplicate controls (e.g. icon toolbar) in the sticky header.
 */
export function bindTreeHeaderInTimelineIntersection(props: {
  timeline: HTMLElement;
  treeHeaderElement: HTMLElement;
  stickyTopInsetPx: number;
  onIntersectingChange: (intersecting: boolean) => void;
}): () => void {
  const inset = Math.max(0, Math.round(props.stickyTopInsetPx));

  const observer = new IntersectionObserver(
    (entries) => {
      props.onIntersectingChange(entries[0]?.isIntersecting ?? false);
    },
    {
      root: props.timeline,
      rootMargin: `-${inset}px 0px 0px 0px`,
      threshold: 0,
    },
  );

  observer.observe(props.treeHeaderElement);

  return () => {
    observer.disconnect();
  };
}
