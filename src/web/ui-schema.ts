import { z } from 'zod';

export const WebToneSchema = z.enum([
  'default',
  'muted',
  'info',
  'success',
  'warning',
  'danger',
]);

export const WebSizeSchema = z.enum(['sm', 'md', 'lg']);

export const WebWeightSchema = z.enum(['normal', 'medium', 'semibold', 'bold']);

export const WebGapSchema = z.enum(['xs', 'sm', 'md', 'lg']);

export const WebPaddingSchema = z.enum(['xs', 'sm', 'md', 'lg']);

export const WebAlignSchema = z.enum(['start', 'center', 'end', 'between']);

export const WebRefreshSchema = z.object({
  command: z.string().min(1),
  subcommand: z.string().min(1),
  arguments: z.record(z.string(), z.unknown()).optional().default({}),
  options: z.record(z.string(), z.unknown()).optional().default({}),
});

/** Optional line under a command option in the web form; not sent to the bot. */
export const WebOptionFieldHintObjectSchema = z.object({
  /** Human-readable context for the current option value (e.g. todo title for `--under`). */
  hint: z.string(),
});

export const WebOptionFieldHintValueSchema = z.union([
  z.string(),
  WebOptionFieldHintObjectSchema,
]);

export type WebOptionFieldHintValue = z.infer<
  typeof WebOptionFieldHintValueSchema
>;

export const WebActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('command'),
    command: z.string().min(1),
    subcommand: z.string().min(1),
    arguments: z.record(z.string(), z.unknown()).optional().default({}),
    options: z.record(z.string(), z.unknown()).optional().default({}),
    refresh: WebRefreshSchema.optional(),
    /** When `form`, open the timeline command form with prefilled args/options instead of running immediately. */
    presentation: z.enum(['run', 'form']).optional(),
    /**
     * Display-only hints for options (key = option `name` from the command definition, e.g. `under`).
     * Use `{ hint: "…" }` for integer ids; the form shows `#<value> = <hint>`. A plain string is shown as-is.
     */
    optionHints: z.record(z.string(), WebOptionFieldHintValueSchema).optional(),
  }),
  z.object({
    type: z.literal('prompt_answer'),
    value: z.string(),
  }),
]);

export const WebWhiteSpaceSchema = z.enum(['pre-wrap']);

export const WebItemAlignSchema = z.enum([
  'start',
  'center',
  'end',
  'stretch',
  'baseline',
]);

export const WebButtonVariantSchema = z.enum(['default', 'icon']);

export const WebPropsSchema = z.object({
  id: z.string().min(1).optional(),
  className: z.string().min(1).optional(),
  ui: z.string().min(1).optional(),
  href: z.string().min(1).optional(),
  external: z.boolean().optional(),
  tone: WebToneSchema.optional(),
  size: WebSizeSchema.optional(),
  weight: WebWeightSchema.optional(),
  gap: WebGapSchema.optional(),
  padding: WebPaddingSchema.optional(),
  indent: z.number().int().nonnegative().optional(),
  align: WebAlignSchema.optional(),
  /** Flex cross-axis (`align-items`) for `row`; use with multi-line or mixed-height content. */
  itemAlign: WebItemAlignSchema.optional(),
  /** When true, `flex: 1; min-width: 0` so the node grows inside a `row` (e.g. middle column). */
  fill: z.literal(true).optional(),
  whiteSpace: WebWhiteSpaceSchema.optional(),
  /** Compact square-ish control; maps to shared client styles, not plugin CSS. */
  buttonVariant: WebButtonVariantSchema.optional(),
  defaultExpanded: z.boolean().optional(),
  label: z.string().optional(),
  checked: z.boolean().optional(),
  /** Native checkbox indeterminate (e.g. in-progress); set via DOM, not HTML attribute. */
  indeterminate: z.literal(true).optional(),
  disabled: z.boolean().optional(),
  action: WebActionSchema.optional(),
});

export const WebTextNodeSchema = z.object({
  type: z.literal('text'),
  value: z.string(),
});

export const WebElementTagSchema = z.enum([
  'stack',
  'row',
  'box',
  'text',
  'link',
  'badge',
  'button',
  'checkbox',
  'divider',
  /** Trigger + dropdown; children should be `menuItem` elements. */
  'overflowMenu',
  /** Row in an overflow menu; `label` + `action` required. */
  'menuItem',
  /** Generic hierarchical container rendered with local expand/collapse state. */
  'tree',
  /** First child is the item summary; remaining children are collapsible body/subtree. */
  'treeItem',
]);

export type WebTextNode = z.infer<typeof WebTextNodeSchema>;

export type WebElementNode = {
  type: 'element';
  tag: z.infer<typeof WebElementTagSchema>;
  props?: z.infer<typeof WebPropsSchema>;
  children?: WebNode[];
};

export type WebNode = WebTextNode | WebElementNode;

export const WebElementNodeSchema: z.ZodType<WebElementNode> = z.lazy(() =>
  z.object({
    type: z.literal('element'),
    tag: WebElementTagSchema,
    props: WebPropsSchema.optional(),
    children: z.array(WebNodeSchema).optional(),
  }),
);

export const WebNodeSchema: z.ZodType<WebNode> = z.lazy(() =>
  z.union([WebTextNodeSchema, WebElementNodeSchema]),
);

export const WebRenderMetaSchema = z.object({
  command: z.string().min(1),
  subcommand: z.string().min(1),
});

/** Scoped CSS for one WebNodeRoot render; applied inside Shadow DOM only (client). */
export const WebStyleSheetSchema = z.object({
  id: z.string().min(1),
  cssText: z.string(),
});

/**
 * How the Solid mount div inside the shadow root handles overflow.
 * - `scroll-y` (default when omitted): mount scrolls when the tree is taller than the host (e.g. timeline cards).
 * - `hidden`: mount does not scroll; the tree should use inner `overflow: auto` regions (e.g. modal sub-panels).
 */
export const WebShadowMountOverflowSchema = z.enum(['hidden', 'scroll-y']);

export const WebRenderResultSchema = z.object({
  kind: z.literal('ui'),
  version: z.literal(1),
  meta: WebRenderMetaSchema,
  tree: WebNodeSchema,
  stylesheets: z.array(WebStyleSheetSchema).optional(),
  shadowMountOverflow: WebShadowMountOverflowSchema.optional(),
});

export type WebAction = z.infer<typeof WebActionSchema>;
export type WebProps = z.infer<typeof WebPropsSchema>;
export type WebRenderMeta = z.infer<typeof WebRenderMetaSchema>;
export type WebNodeRoot = z.infer<typeof WebRenderResultSchema>;
export type WebShadowMountOverflow = z.infer<
  typeof WebShadowMountOverflowSchema
>;
export type WebStyleSheet = z.infer<typeof WebStyleSheetSchema>;
export type WebTone = z.infer<typeof WebToneSchema>;
