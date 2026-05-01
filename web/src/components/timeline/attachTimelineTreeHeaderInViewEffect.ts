import type { Accessor, Setter } from 'solid-js';
import { createEffect, onCleanup } from 'solid-js';

import { bindTreeHeaderInTimelineIntersection } from './treeHeaderInTimelineIntersection';

/** Call from a component body: observes shadow `.web-tree-header` vs timeline region below sticky card head. */
export function attachTimelineTreeHeaderInViewEffect(props: {
  cardEl: Accessor<HTMLDivElement | undefined>;
  treeHeaderEl: Accessor<HTMLElement | null>;
  setTreeHeaderInView: Setter<boolean>;
}): void {
  createEffect(() => {
    const header = props.treeHeaderEl();
    const card = props.cardEl();

    if (header == null || card == null) {
      props.setTreeHeaderInView(true);

      return;
    }

    const timeline = card.closest('.timeline');

    if (timeline == null || !(timeline instanceof HTMLElement)) {
      props.setTreeHeaderInView(true);

      return;
    }

    const head = card.querySelector('.card-head--timeline-sticky');
    const inset = Math.ceil(head?.getBoundingClientRect().height ?? 56);

    const unbind = bindTreeHeaderInTimelineIntersection({
      timeline,
      treeHeaderElement: header,
      stickyTopInsetPx: inset,
      onIntersectingChange: props.setTreeHeaderInView,
    });

    onCleanup(() => {
      unbind();
      props.setTreeHeaderInView(true);
    });
  });
}
