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
  highlightTargetIds: z.array(z.string().min(1)).optional(),
  highlightTargetIdFromOutput: z
    .object({
      pattern: z.string().min(1),
      template: z.string().min(1),
    })
    .optional(),
  expandTreeItemIds: z.array(z.string().min(1)).optional(),
  expandTreeItemIdFromOption: z
    .object({
      option: z.string().min(1),
      template: z.string().min(1),
    })
    .optional(),
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

/** Labeled choices for a command argument in web forms (`provider/model` ids, etc.). */
export const WebArgumentFieldChoiceSchema = z.object({
  value: z.string(),
  label: z.string(),
});

export type WebArgumentFieldChoice = z.infer<
  typeof WebArgumentFieldChoiceSchema
>;

export const WebActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('reveal'),
    targetId: z.string().min(1),
  }),
  z.object({
    /** Collapse a previously revealed node (removes matching `targetId` from local reveal state). */
    type: z.literal('hideReveal'),
    targetId: z.string().min(1),
  }),
  z.object({
    /** Toggle a reveal target open/closed. */
    type: z.literal('toggleReveal'),
    targetId: z.string().min(1),
  }),
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
    /**
     * Suggested values for positional arguments (key = argument `name` from the command definition).
     * Rendered as a text field with datalist; users may still enter values not in the list.
     */
    argumentChoices: z
      .record(z.string(), z.array(WebArgumentFieldChoiceSchema))
      .optional(),
    /** Whether this web-triggered command should create timeline entries. */
    recordInTimeline: z.boolean().optional(),
    /** How to present command execution in web clients. */
    surface: z.enum(['timeline', 'modal']).optional(),
    /** Optional title when `surface` is `modal`. */
    modalTitle: z.string().min(1).optional(),
  }),
  z.object({
    /** Browser-side action handled by the web app; payload is client-specific JSON. */
    type: z.literal('clientAction'),
    action: z.string().min(1),
    payload: z.record(z.string(), z.unknown()).optional().default({}),
    refresh: WebRefreshSchema.optional(),
  }),
  z.object({
    type: z.literal('prompt_answer'),
    value: z.string(),
    /** Optional form field whose value is appended to `value` with a space. */
    valueFromField: z.string().min(1).optional(),
  }),
]);

export const WebToolbarActionSchema = z.object({
  label: z.string().min(1),
  icon: z.enum(['add', 'checklist', 'log']).optional(),
  action: WebActionSchema,
});

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
  /** Enables built-in client-side filtering for supported collection elements. */
  filterable: z.literal(true).optional(),
  /** Text searched by a parent filter; plugins choose the fields included here. */
  filterText: z.string().optional(),
  /** Stable display name for structured filtering/glob matching. */
  filterName: z.string().optional(),
  /** Stable path/key for structured filtering/glob matching. */
  filterPath: z.string().optional(),
  /** `treeItem`: when set, only clicks matching this selector toggle the item. */
  toggleSelector: z.string().min(1).optional(),
  /** Cache key for a client-built filter index. */
  filterIndexKey: z.string().optional(),
  /** Placeholder for built-in filter inputs. */
  filterPlaceholder: z.string().optional(),
  defaultExpanded: z.boolean().optional(),
  label: z.string().optional(),
  src: z.string().min(1).optional(),
  alt: z.string().optional(),
  checked: z.boolean().optional(),
  /** Native checkbox indeterminate (e.g. in-progress); set via DOM, not HTML attribute. */
  indeterminate: z.literal(true).optional(),
  disabled: z.boolean().optional(),
  /** `treeItem`: action to run the first time an unloaded branch is expanded. */
  lazyLoadAction: WebActionSchema.optional(),
  /** `treeItem`: true once this branch's lazy children are represented in the current tree. */
  lazyLoaded: z.boolean().optional(),
  /** `treeItem`: loading label shown while `lazyLoadAction` is running. */
  lazyLoadingLabel: z.string().optional(),
  /** Extra actions hoisted into timeline card header toolbar for root tree UIs. */
  toolbarActions: z.array(WebToolbarActionSchema).optional(),
  /** Hide this node until `{ type: "reveal", targetId }`; `{ type: "hideReveal", targetId }` collapses again. */
  revealId: z.string().min(1).optional(),
  hiddenUntilRevealed: z.literal(true).optional(),
  /** Hide this node unless the connected browser signer pubkey is in this allow-list. */
  visibleForPubkeys: z.array(z.string().min(1)).optional(),
  action: WebActionSchema.optional(),
  stopPropagation: z.boolean().optional(),
  /** `textField`: name submitted with parent `form` (FormData / merge into command `arguments`). */
  formFieldName: z.string().min(1).optional(),
  /** `textField`: placeholder; display-only, not a command option hint. */
  inputPlaceholder: z.string().optional(),
  /** `select`: allowed option values. */
  choices: z.array(z.string()).optional(),
  /** `select`: display labels keyed by submitted option value. */
  choiceLabels: z.record(z.string(), z.string()).optional(),
  /** `select`/`textField`: initially selected or prefilled value. */
  value: z.string().optional(),
  /** `choiceField`: option value that opens a freeform numeric/text input. */
  customChoice: z.string().optional(),
  /** `textArea`: maximum auto-grown visible rows before internal scrolling. */
  maxRows: z.number().int().positive().optional(),
  /** `textField`: focus the input when it is mounted. */
  autoFocus: z.literal(true).optional(),
  /** Stable target id used by story walkthrough focus/fill steps. */
  storyTargetId: z.string().min(1).optional(),
  /** `button`: native `type` (`submit` for forms). Default when omitted: `button`. */
  htmlType: z.enum(['button', 'submit']).optional(),
  /** `form`: fields with these names merge into command `options` instead of positional `arguments`. */
  formOptionFieldNames: z.array(z.string().min(1)).optional(),
  /** Optional plain text that generic clients may expose through read-aloud controls. */
  ttsText: z.string().optional(),
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
  'image',
  'button',
  'checkbox',
  'divider',
  /** Trigger + dropdown; children should be `menuItem` elements. */
  'overflowMenu',
  /** Row in an overflow menu; `label` + `action` required. */
  'menuItem',
  /** Generic hierarchical container rendered with local expand/collapse state. */
  'tree',
  /** Hierarchical item. Prefer `summary` for the row and `children` for child items. */
  'treeItem',
  /** One-line text input; use `formFieldName` with parent `form`. */
  'textField',
  /** Dropdown/select input; use `formFieldName` with parent `form`. */
  'select',
  /** Segmented choice input; use `formFieldName` with parent `form`. */
  'choiceField',
  /** Multi-line text input with auto-growing height; use `formFieldName` with parent `form`. */
  'textArea',
  /**
   * Group fields and submit: `action` is merged with `FormData` on the client.
   * - `command`: FormData keys map into `arguments`
   * - `prompt_answer`: `valueFromField` appends one field value to `value`
   */
  'form',
]);

export type WebTextNode = z.infer<typeof WebTextNodeSchema>;

export type WebElementNode = {
  type: 'element';
  tag: z.infer<typeof WebElementTagSchema>;
  props?: z.infer<typeof WebPropsSchema>;
  /** Optional tree item summary; if omitted, first child is used for backward compatibility. */
  summary?: WebNode;
  children?: WebNode[];
};

export type WebNode = WebTextNode | WebElementNode;

export const WebElementNodeSchema: z.ZodType<WebElementNode> = z.lazy(() =>
  z.object({
    type: z.literal('element'),
    tag: WebElementTagSchema,
    props: WebPropsSchema.optional(),
    summary: WebNodeSchema.optional(),
    children: z.array(WebNodeSchema).optional(),
  }),
);

export const WebNodeSchema: z.ZodType<WebNode> = z.lazy(() =>
  z.union([WebTextNodeSchema, WebElementNodeSchema]),
);

export const WebRenderMetaSchema = z.object({
  command: z.string().min(1),
  subcommand: z.string().min(1),
  arguments: z.record(z.string(), z.unknown()).optional(),
  options: z.record(z.string(), z.unknown()).optional(),
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

export const ClientViewResultSchema = z.object({
  kind: z.literal('client_view'),
  version: z.literal(1),
  view: z.string().min(1),
  meta: WebRenderMetaSchema,
  payload: z.unknown(),
});

export const TimelineFileDiffSchema = z.object({
  file: z.string(),
  patch: z.string(),
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
  status: z.enum(['added', 'deleted', 'modified']).nullable(),
});

export const TimelineDiffEventSchema = z.object({
  type: z.literal('diff'),
  files: z.array(TimelineFileDiffSchema),
  title: z.string().nullable(),
  subtitle: z.string().nullable(),
  origin: z.enum(['workspace_diff', 'git_commit']).nullable(),
});

export const TimelineEventOutputSchema = z.object({
  kind: z.literal('timeline_event'),
  version: z.literal(1),
  event: TimelineDiffEventSchema,
});

export type WebAction = z.infer<typeof WebActionSchema>;
export type WebProps = z.infer<typeof WebPropsSchema>;
export type WebRenderMeta = z.infer<typeof WebRenderMetaSchema>;
export type WebNodeRoot = z.infer<typeof WebRenderResultSchema>;
export type ClientViewRoot = z.infer<typeof ClientViewResultSchema>;
export type TimelineEventOutput = z.infer<typeof TimelineEventOutputSchema>;
/** Union of all possible return types from command handlers. */
export type WebHandlerResult =
  | string
  | WebNodeRoot
  | ClientViewRoot
  | TimelineEventOutput;
export type WebShadowMountOverflow = z.infer<
  typeof WebShadowMountOverflowSchema
>;
export type WebStyleSheet = z.infer<typeof WebStyleSheetSchema>;
export type WebTone = z.infer<typeof WebToneSchema>;
