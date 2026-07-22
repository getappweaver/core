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
  /** Whether the refresh command should create timeline entries. Defaults to the parent action policy. */
  recordInTimeline: z.boolean().optional(),
  expandTreeItemIds: z.array(z.string().min(1)).optional(),
  expandTreeItemIdFromOption: z
    .object({
      option: z.string().min(1),
      template: z.string().min(1),
    })
    .optional(),
});

export const WebCommandStatusSchema = z.object({
  /** Run without blocking the source widget busy overlay; useful for long commands. */
  background: z.boolean().optional(),
  pending: z.string().min(1).optional(),
  restarting: z.string().min(1).optional(),
  success: z.string().min(1).optional(),
  /** Include command text output in the final background completion system message. */
  successOutput: z.enum(['appendText']).optional(),
  /** Optional id of a `commandStatus` node to update while this command runs. */
  statusTargetId: z.string().min(1).optional(),
});

export const WebPendingUiSchema = z.object({
  presentation: z.enum(['widget', 'entity', 'none']),
  label: z.string().min(1).optional(),
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
    /** Expand tree items before revealing a target nested inside collapsed content. */
    expandTreeItemIds: z.array(z.string().min(1)).optional(),
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
    /** Expand tree items before toggling a target nested inside collapsed content. */
    expandTreeItemIds: z.array(z.string().min(1)).optional(),
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
    /** Reveal these local UI targets after replacing the current web root with this command result. */
    revealIds: z.array(z.string().min(1)).optional(),
    /** Expand local tree items before running the command action. */
    expandTreeItemIds: z.array(z.string().min(1)).optional(),
    /** Client-side context values to resolve and include before command execution. */
    clientContext: z.array(z.enum(['nostrSearchRelays'])).optional(),
    /** Optional client-visible lifecycle messages for long-running command actions. */
    clientStatus: WebCommandStatusSchema.optional(),
    /** Choose widget-wide, nearest-entity, or no pending presentation. */
    pendingUi: WebPendingUiSchema.optional(),
  }),
  z.object({
    /** Browser-side action handled by the web app; payload is client-specific JSON. */
    type: z.literal('clientAction'),
    action: z.string().min(1),
    payload: z.record(z.string(), z.unknown()).optional().default({}),
    refresh: WebRefreshSchema.optional(),
  }),
  z.object({
    /** Run a plain agent/chat prompt from a web widget without routing through a command. */
    type: z.literal('agentPrompt'),
    prompt: z.string().min(1),
    /** Whether this web-triggered prompt should create timeline entries. */
    recordInTimeline: z.boolean().optional(),
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
  icon: z
    .enum([
      'add',
      'checklist',
      'copy',
      'diff',
      'edit',
      'log',
      'openTimeline',
      'save',
      'settings',
    ])
    .optional(),
  activeLabel: z.string().min(1).optional(),
  activeIcon: z
    .enum([
      'add',
      'checklist',
      'copy',
      'diff',
      'edit',
      'log',
      'openTimeline',
      'save',
      'settings',
    ])
    .optional(),
  toggleKey: z.string().min(1).optional(),
  className: z.string().min(1).optional(),
  visibleOnSurfaces: z.array(z.enum(['dock', 'modal', 'timeline'])).optional(),
  storyTargetId: z.string().min(1).optional(),
  action: WebActionSchema,
  activeAction: WebActionSchema.optional(),
});

export const WebNostrPostExtraActionSchema = z.object({
  label: z.string().min(1),
  ariaLabel: z.string().min(1).optional(),
  action: WebActionSchema.nullable(),
  disabled: z.boolean().optional(),
  active: z.boolean().optional(),
});

export const WebNostrSharePrefixesSchema = z.object({
  nevent: z.string().min(1),
  nprofile: z.string().min(1),
});

const WebNostrPostReferenceBaseSchema = z.object({
  /** Shared logical identity for pending state on nested post references. */
  entityKey: z.string().min(1).optional(),
  token: z.string().min(1).optional(),
  type: z.enum(['event', 'profile', 'address', 'unknown']).optional(),
  id: z.string().min(1).optional(),
  pubkey: z.string().min(1).optional(),
  kind: z.number().int().optional(),
  npub: z.string().min(1).optional(),
  relayHints: z.array(z.string().min(1)).optional(),
  authorName: z.string().min(1).optional(),
  authorUsername: z.string().min(1).optional(),
  authorPicture: z.string().min(1).optional(),
  authorAbout: z.string().optional(),
  createdAt: z.number().int().optional(),
  content: z.string().optional(),
  href: z.string().min(1).optional(),
  label: z.string().min(1).optional(),
  readAction: WebActionSchema.nullable().optional(),
  archiveAction: WebActionSchema.nullable().optional(),
  archived: z.boolean().optional(),
  likeAction: WebActionSchema.nullable().optional(),
  replyAction: WebActionSchema.nullable().optional(),
  repostAction: WebActionSchema.nullable().optional(),
  liked: z.boolean().optional(),
  replied: z.boolean().optional(),
  reposted: z.boolean().optional(),
  quoted: z.boolean().optional(),
  showActions: z.boolean().optional(),
  trailingActions: z.array(WebNostrPostExtraActionSchema).optional(),
  inlineProfiles: z
    .record(
      z.string(),
      z.object({
        pubkey: z.string().min(1).optional(),
        npub: z.string().min(1).optional(),
        relayHints: z.array(z.string().min(1)).optional(),
        authorName: z.string().min(1).optional(),
        authorUsername: z.string().min(1).optional(),
        authorPicture: z.string().min(1).optional(),
        authorAbout: z.string().optional(),
      }),
    )
    .optional(),
});

export const WebNostrPostReferenceSchema =
  WebNostrPostReferenceBaseSchema.extend({
    embeddedReferences: z.array(WebNostrPostReferenceBaseSchema).optional(),
  });

export const WebNostrPostMediaSchema = z.object({
  type: z.literal('image'),
  url: z.string().min(1),
  alt: z.string().optional(),
});

export const WebNostrInlineProfilesSchema = z.record(
  z.string(),
  z.object({
    pubkey: z.string().min(1).optional(),
    npub: z.string().min(1).optional(),
    relayHints: z.array(z.string().min(1)).optional(),
    authorName: z.string().min(1).optional(),
    authorUsername: z.string().min(1).optional(),
    authorPicture: z.string().min(1).optional(),
    authorAbout: z.string().optional(),
  }),
);

export const WebNostrPostActivityHeaderSchema = z.object({
  label: z.string().min(1),
  actorPubkey: z.string().min(1),
  actorNpub: z.string().min(1).optional(),
  actorName: z.string().min(1).optional(),
  actorUsername: z.string().min(1).optional(),
  actorPicture: z.string().min(1).optional(),
  actorAbout: z.string().optional(),
  createdAt: z.number().int(),
});

export const WebNostrPostPropsSchema = z.object({
  /** Raw event id. */
  nostrEventId: z.string().min(1).optional(),
  /** Event author pubkey. */
  nostrPubkey: z.string().min(1).optional(),
  /** Event created_at unix timestamp in seconds. */
  nostrCreatedAt: z.number().int().optional(),
  /** Event content. */
  nostrContent: z.string().optional(),
  /** Display name from profile metadata. */
  nostrAuthorName: z.string().min(1).optional(),
  /** Username/name fallback from profile metadata. */
  nostrAuthorUsername: z.string().min(1).optional(),
  /** Profile image URL. */
  nostrAuthorPicture: z.string().min(1).optional(),
  /** Profile about/bio text from metadata. */
  nostrAuthorAbout: z.string().optional(),
  /** Encoded npub fallback. */
  nostrNpub: z.string().min(1).optional(),
  /** Relay hints for encoding nprofile/opening profile. */
  nostrRelayHints: z.array(z.string().min(1)).optional(),
  /** Configured URL prefixes for sharing Nostr event and profile identifiers. */
  nostrSharePrefixes: WebNostrSharePrefixesSchema.optional(),
  /** Optional external permalink for clients that have one. */
  nostrPermalink: z.string().min(1).optional(),
  /** View-only display count. */
  nostrLikeCount: z.number().int().nonnegative().optional(),
  /** View-only display count. */
  nostrReplyCount: z.number().int().nonnegative().optional(),
  /** Optional command/client action for plugin-owned read behavior. */
  nostrReadAction: WebActionSchema.nullable().optional(),
  /** Additional plugin-owned actions shown after Read. */
  nostrExtraActions: z.array(WebNostrPostExtraActionSchema).optional(),
  /** Additional plugin-owned actions shown after public post actions. */
  nostrTrailingActions: z.array(WebNostrPostExtraActionSchema).optional(),
  /** Additional plugin-owned actions shown in the author's profile modal. */
  nostrProfileActions: z.array(WebNostrPostExtraActionSchema).optional(),
  /** Optional command/client action for plugin-owned archive behavior. */
  nostrArchiveAction: WebActionSchema.nullable().optional(),
  /** True when plugin-owned archive state is active. */
  nostrArchived: z.boolean().optional(),
  /** Optional command/client action for plugin-owned like behavior. */
  nostrLikeAction: WebActionSchema.nullable().optional(),
  /** Optional command/client action for plugin-owned reply behavior. */
  nostrReplyAction: WebActionSchema.nullable().optional(),
  /** Optional command/client action for plugin-owned repost/quote behavior. */
  nostrRepostAction: WebActionSchema.nullable().optional(),
  /** Known persisted interaction state for current/personal user. */
  nostrLiked: z.boolean().optional(),
  nostrReplied: z.boolean().optional(),
  nostrReposted: z.boolean().optional(),
  nostrQuoted: z.boolean().optional(),
  /** Activity envelopes displayed above this post, such as reposts, reactions, or future zaps. */
  nostrActivityHeaders: z.array(WebNostrPostActivityHeaderSchema).optional(),
  /** Show Like/Reply action row. Defaults to true. */
  nostrShowActions: z.boolean().optional(),
  /** NIP-21 references keyed by the exact `nostr:...` token in content. */
  nostrEmbeds: z.record(z.string(), WebNostrPostReferenceSchema).optional(),
  /** NIP-21 profile references keyed by the exact `nostr:...` token in content. */
  nostrInlineProfiles: WebNostrInlineProfilesSchema.optional(),
  /** NIP-10 reply/root context supplied by the plugin; renderer is view-only. */
  nostrReplyContext: z.array(WebNostrPostReferenceSchema).optional(),
  /** Render supplied reply/root context. Defaults to false until compact UX settles. */
  nostrShowReplyContext: z.boolean().optional(),
  /** Explicit media attachments supplied by the plugin. */
  nostrMedia: z.array(WebNostrPostMediaSchema).optional(),
  /** Show compact media preview toggle when image media exists. Defaults to true. */
  nostrPreviewImages: z.boolean().optional(),
  /** Collapsed body length before showing More. Defaults to 420. */
  nostrCollapsedContentChars: z.number().int().positive().optional(),
  /** Start expanded instead of collapsed. */
  nostrInitiallyExpanded: z.boolean().optional(),
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

export const WebBasePropsSchema = z.object({
  id: z.string().min(1).optional(),
  /** Shared logical identity; unlike `renderKey`, duplicates are intentional. */
  entityKey: z.string().min(1).optional(),
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
  /** `tabs`: initially selected tab panel id. */
  defaultActiveTabId: z.string().min(1).optional(),
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
  /** Hide this node while a local toolbar/client toggle key is active. */
  hiddenWhenToggleKey: z.string().min(1).optional(),
  /** Hide this node unless a local toolbar/client toggle key is active. */
  visibleWhenToggleKey: z.string().min(1).optional(),
  /** Hide this node unless the connected browser signer pubkey is in this allow-list. */
  visibleForPubkeys: z.array(z.string().min(1)).optional(),
  /** Native contenteditable mode for simple browser-side editing experiments. */
  contentEditable: z
    .union([z.boolean(), z.literal('plaintext-only')])
    .optional(),
  /** `editableText`: stable id used by browser-side save/extraction actions. */
  editableTextId: z.string().min(1).optional(),
  /** `editableText`: initial text content. */
  editableTextValue: z.string().optional(),
  /** `editableText`: render a live line-number gutter. */
  showLineNumbers: z.literal(true).optional(),
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
  /** `choiceField`: initially selected values for multi-select fields. */
  values: z.array(z.string()).optional(),
  /** `choiceField`: allow selecting multiple choices; submits one form value per selection. */
  multiple: z.literal(true).optional(),
  /** `choiceField`: option value that opens a freeform numeric/text input. */
  customChoice: z.string().optional(),
  /** `textArea`: maximum auto-grown visible rows before internal scrolling. */
  maxRows: z.number().int().positive().optional(),
  /** `textField`: focus the input when it is mounted. */
  autoFocus: z.literal(true).optional(),
  /** Scroll this element into view when it is mounted/replaced. */
  scrollIntoViewOnMount: z.literal(true).optional(),
  /** Optional one-shot key for `scrollIntoViewOnMount`; consumed in browser session storage. */
  scrollIntoViewOnceKey: z.string().min(1).optional(),
  /** Stable target id used by story walkthrough focus/fill steps. */
  storyTargetId: z.string().min(1).optional(),
  /** `button`: native `type` (`submit` for forms). Default when omitted: `button`. */
  htmlType: z.enum(['button', 'submit']).optional(),
  /** `button`: override form submit action when this button submits the form. */
  submitAction: WebActionSchema.optional(),
  /** `button`: disable submit until this form field is a positive integer. */
  disabledUntilFormFieldPositiveInteger: z.string().min(1).optional(),
  /** `form`: fields with these names merge into command `options` instead of positional `arguments`. */
  formOptionFieldNames: z.array(z.string().min(1)).optional(),
  /** Optional plain text that generic clients may expose through read-aloud controls. */
  ttsText: z.string().optional(),
});

export const WebNostrPostElementPropsSchema = WebBasePropsSchema.extend(
  WebNostrPostPropsSchema.shape,
);

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
  /** Compact, view-only Nostr kind:1 style post renderer. */
  'nostrPost',
  /** Local browser-side command progress/status target keyed by `props.id`. */
  'commandStatus',
  'button',
  'checkbox',
  'divider',
  /** Invisible spacing row; useful between items in a shared tree context. */
  'spacer',
  /** Trigger + dropdown; children should be `menuItem` elements. */
  'overflowMenu',
  /** Row in an overflow menu; `label` + `action` required. */
  'menuItem',
  /** Generic hierarchical container rendered with local expand/collapse state. */
  'tree',
  /** Reads the nearest tree filter and shows a clear action when filtering. */
  'treeFilterStatus',
  /** Hierarchical item. Prefer `summary` for the row and `children` for child items. */
  'treeItem',
  /** Generic tab list; direct children should be `tabPanel` elements. */
  'tabs',
  /** Panel inside `tabs`; `label` is shown in the tab button. */
  'tabPanel',
  /** One-line text input; use `formFieldName` with parent `form`. */
  'textField',
  /** Dropdown/select input; use `formFieldName` with parent `form`. */
  'select',
  /** Segmented choice input; use `formFieldName` with parent `form`. */
  'choiceField',
  /** Multi-line text input with auto-growing height; use `formFieldName` with parent `form`. */
  'textArea',
  /** Browser-side editable text surface with optional live line numbers. */
  'editableText',
  /**
   * Group fields and submit: `action` is merged with `FormData` on the client.
   * - `command`: FormData keys map into `arguments`
   * - `prompt_answer`: `valueFromField` appends one field value to `value`
   */
  'form',
]);

export const WebGenericElementTagSchema = z.enum([
  'stack',
  'row',
  'box',
  'text',
  'link',
  'badge',
  'image',
  'commandStatus',
  'button',
  'checkbox',
  'divider',
  'spacer',
  'overflowMenu',
  'menuItem',
  'tree',
  'treeFilterStatus',
  'treeItem',
  'tabs',
  'tabPanel',
  'textField',
  'select',
  'choiceField',
  'textArea',
  'editableText',
  'form',
]);

export type WebTextNode = z.infer<typeof WebTextNodeSchema>;

export type WebGenericElementNode = {
  type: 'element';
  tag: z.infer<typeof WebGenericElementTagSchema>;
  /** Stable sibling identity used by client-side render reconciliation. */
  renderKey?: string;
  props?: z.infer<typeof WebBasePropsSchema>;
  /** Optional tree item summary; if omitted, first child is used for backward compatibility. */
  summary?: WebNode;
  children?: WebNode[];
};

export type WebBaseProps = z.infer<typeof WebBasePropsSchema>;
export type WebNostrPostProps = z.infer<typeof WebNostrPostElementPropsSchema>;

export type WebNostrPostElement = {
  type: 'element';
  tag: 'nostrPost';
  /** Stable sibling identity used by client-side render reconciliation. */
  renderKey?: string;
  props?: WebNostrPostProps;
  summary?: WebNode;
  children?: WebNode[];
};

export type WebElementNode = WebGenericElementNode | WebNostrPostElement;

export type WebNode = WebTextNode | WebElementNode;

export const WebElementNodeSchema: z.ZodType<WebElementNode> = z.lazy(() =>
  z.union([
    z.object({
      type: z.literal('element'),
      tag: z.literal('nostrPost'),
      renderKey: z.string().min(1).optional(),
      props: WebNostrPostElementPropsSchema.optional(),
      summary: WebNodeSchema.optional(),
      children: z.array(WebNodeSchema).optional(),
    }),
    z.object({
      type: z.literal('element'),
      tag: WebGenericElementTagSchema,
      renderKey: z.string().min(1).optional(),
      props: WebBasePropsSchema.optional(),
      summary: WebNodeSchema.optional(),
      children: z.array(WebNodeSchema).optional(),
    }),
  ]),
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

export const WebWidgetHelpStorySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  pluginAlias: z.string().min(1),
  iconUrl: z.string().optional(),
});

export const WebWidgetHelpSchema = z.object({
  title: z.string().min(1),
  body: z.array(z.string().min(1)),
  stories: z.array(WebWidgetHelpStorySchema).optional(),
  defaultOpen: z.boolean().optional(),
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
  widgetHelp: WebWidgetHelpSchema.optional(),
  initialRevealedIds: z.array(z.string().min(1)).optional(),
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
  origin: z.enum(['workspace_diff', 'git_commit', 'agent_patch']).nullable(),
  scopePath: z.string().nullable().optional(),
  stagedFiles: z.array(z.string()).optional(),
});

export const TimelineEventOutputSchema = z.object({
  kind: z.literal('timeline_event'),
  version: z.literal(1),
  event: TimelineDiffEventSchema,
});

export type WebAction = z.infer<typeof WebActionSchema>;
export type WebNostrPostReference = z.infer<typeof WebNostrPostReferenceSchema>;
export type WebNostrPostMedia = z.infer<typeof WebNostrPostMediaSchema>;
export type WebNostrPostExtraAction = z.infer<
  typeof WebNostrPostExtraActionSchema
>;
export type WebProps = WebBaseProps;
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
