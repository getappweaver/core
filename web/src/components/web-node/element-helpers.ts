import type { WebElementNode } from '@src/web/ui-schema';

/** Tone, className, size, weight from element props (no `web-node` / `web-${tag}`). */
export function elementPropsClasses(
  props: WebElementNode['props'] | undefined,
): string[] {
  const classes: string[] = [];

  if (!props) {
    return classes;
  }

  if (props.tone) {
    classes.push(`tone-${props.tone}`);
  }

  if (props.className) {
    classes.push(props.className);
  }

  if (props.size) {
    classes.push(`size-${props.size}`);
  }

  if (props.weight) {
    classes.push(`weight-${props.weight}`);
  }

  return classes;
}

export function elementClass(node: WebElementNode): string {
  const classes = [
    'web-node',
    `web-${node.tag}`,
    ...elementPropsClasses(node.props),
  ];

  return classes.join(' ');
}

export const GAP_REM: Record<'xs' | 'sm' | 'md' | 'lg', string> = {
  xs: '0.25rem',
  sm: '0.35rem',
  md: '0.5rem',
  lg: '0.85rem',
};

export const PADDING_REM: Record<'xs' | 'sm' | 'md' | 'lg', string> = {
  xs: '0.35rem 0.45rem',
  sm: '0.45rem 0.55rem',
  md: '0.55rem 0.65rem',
  lg: '0.75rem 0.85rem',
};

export const ROW_JUSTIFY: Record<
  'start' | 'center' | 'end' | 'between',
  string
> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  between: 'space-between',
};

export const FLEX_ALIGN: Record<
  'start' | 'center' | 'end' | 'stretch' | 'baseline',
  string
> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  stretch: 'stretch',
  baseline: 'baseline',
};

export function elementStyle(node: WebElementNode): string | undefined {
  const p = node.props;
  const parts: string[] = [];

  if (typeof p?.indent === 'number') {
    parts.push(`margin-left:${p.indent * 1.25}rem`);
  }

  if (p?.gap) {
    parts.push(`gap:${GAP_REM[p.gap]}`);
  }

  if (p?.padding) {
    parts.push(`padding:${PADDING_REM[p.padding]}`);
  }

  if (node.tag === 'row' && p?.align) {
    parts.push(`justify-content:${ROW_JUSTIFY[p.align]}`);
  }

  if (node.tag === 'row' && p?.itemAlign) {
    parts.push(`align-items:${FLEX_ALIGN[p.itemAlign]}`);
  }

  if (node.tag === 'stack' && p?.align) {
    if (p.align === 'between') {
      parts.push('justify-content:space-between');
    } else {
      parts.push(`align-items:${FLEX_ALIGN[p.align]}`);
    }
  }

  if (p?.fill === true) {
    parts.push('flex:1', 'min-width:0');
  }

  if (p?.whiteSpace === 'pre-wrap') {
    parts.push('white-space:pre-wrap');
  }

  if (
    (node.tag === 'button' || node.tag === 'overflowMenu') &&
    p?.buttonVariant === 'icon'
  ) {
    parts.push(
      'flex-shrink:0',
      'min-width:2rem',
      'line-height:1',
      'padding:0.2rem 0.45rem',
      'font-size:1.15rem',
      'font-weight:600',
    );
  }

  return parts.length > 0 ? parts.join(';') : undefined;
}

export function elementUi(node: WebElementNode): string | undefined {
  return node.props?.ui;
}
