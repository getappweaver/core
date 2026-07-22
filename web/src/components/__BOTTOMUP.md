---
direct_hash: a58fbb66d9acedce602924eebbffcfa93f40d33ac0afc6ce8d2bb26da9b8e91c
subtree_hash: a2c3ebf74cf0bdf2f376bce770246a9ac8fb930169cb275d7cc289cd8ff60066
files:
  AiAgentEditorView.tsx: 324f6bc5ea1c4c8ec69db116961c30bb9b45108753b8bb917cfe0e2dea1a633d
  ChatMarkdown.css: 81ba9d9b36fde88d9f7eb589fd0046df716cdd07ba8f7f8d3c7aa11177556e6d
  ChatMarkdown.tsx: 9e6e132474c7afcce2236d52770a8350913b208bdc73bdc045cda1129412279d
  ClientViewHost.tsx: 4fb91e6c7ace3d89adf8d48127d9c61ac9e0afc3a818933c9e265c14ad7db9c0
  Composer.tsx: 76a5b1cbad88d1f30084ba4c3b08c4e16bd76c15454948997a03101da05d3a37
  ComposerContextMenuButton.tsx: 4ec4fa7e6fb74bca58881fe43f421a919d59915b72d63f3ff5e45410a21d20de
  ComposerModelOverrideButton.tsx: 1e38ea88313a4c694ea111dbce5753e16313f97603765266a7d98b7e41d47467
  ComposerProviderMenuButton.tsx: 5b04bdbc35442a8528ae69313157d22ceb687dab964a2b99565f0842cb0294a6
  ComposerWorkingButton.tsx: 8ac773da69ebdb4511e15943247b91bff67e81c9e179dced0469be65f99233ea
  ConnectModal.tsx: 456d51b59e1f3c60f55413ed5707428f1f990df25c8676d2f4cd5f3febd77f52
  NostrSearchRelaysModal.tsx: 96b80b12075d49044447a52b1978a083c745e63fac4244ec27ba67a36f977680
  OpenCodeModelField.tsx: b37580e30a163e01fa300920e89ffd644a27517c9c4870bf0bb26c31ba5be8bf
  SignEventModal.tsx: e9f1ce1a48ac81328854f65f17545dcf392f8164481fc5c83e6bc2ace9cab23a
  UnlockModal.tsx: b1fdd1ad106911a56acc342fdb9c8553287c8716455ce301c8c6ddb675836f1b
  web-shadow-ui-busy-context.ts: 5a0a2057534848385060945eadce94761858f1ef9e15abdfe27cbeb89cd4c1b7
  WebButton.tsx: 98abcf5dff1e85f748ca93f1a25e3e1c311c3ce4dda48262b23cd2b3390bc19c
  WebCommandOutputModal.tsx: 992c404693fc578838dee0be06d3908fcf15cbea40ffc56bc4b338523be65080
  WebEditableText.tsx: c7c3f66760a8ca2a26e4a4869d3118505ff68426c6374eb6e6e6757acab1f150
  WebNodeRenderer.tsx: b6801781f100ccc869ac04bb6e5e67d89471bdf90aa51ef3d0cec9162690a98f
  WebNodeShadowRoot.tsx: bddfc27ad0e1790d5ab10a8d6bff3976f81ce437c35e78a65666c3d1abe9b7a5
children:
---

# web/src/components

## Purpose
SolidJS UI components for the web chat composer, Nostr signer flows, client-hosted views, and generic WebNode rendering. Shared controls and Shadow DOM rendering support both built-in screens and server-provided UI payloads.

## Files
- `AiAgentEditorView.tsx` - Editor form for creating or updating OpenCode AI-agent configuration and permissions.
- `ChatMarkdown.css` - Role-aware markdown and syntax-highlight styling for chat message content.
- `ChatMarkdown.tsx` - Renders highlighted markdown chat text with selectable sentence-level speech highlighting.
- `ClientViewHost.tsx` - Routes typed client-view payloads to built-in AI-agent and story runtime views.
- `Composer.tsx` - Chat input composer with command launcher, adaptive textarea height, and optional footer.
- `ComposerContextMenuButton.tsx` - Session context menu for compaction and creating a new session.
- `ComposerModelOverrideButton.tsx` - Composer control for setting or clearing the AI model override.
- `ComposerProviderMenuButton.tsx` - Composer menu for switching AI providers and opening Routstr status.
- `ComposerWorkingButton.tsx` - Animated AI-work indicator that exposes a stop action while a run is active.
- `ConnectModal.tsx` - Nostr account connection modal supporting extensions, Amber, bunkers, Nostr Connect, and encrypted keys.
- `NostrSearchRelaysModal.tsx` - Modal for loading, editing, encrypting, and saving a user's Nostr search relay list.
- `OpenCodeModelField.tsx` - Reusable model text field with optional OpenCode model catalog suggestions.
- `SignEventModal.tsx` - Signer chooser for events, including current identity and saved or newly connected bunkers.
- `UnlockModal.tsx` - Passphrase modal for unlocking a locally stored NIP-49 encrypted key.
- `web-shadow-ui-busy-context.ts` - Context carrying the busy state for controls inside rendered Shadow DOM UI.
- `WebButton.tsx` - Shared button wrapper that preserves Solid ref behavior and web-button interaction conventions.
- `WebCommandOutputModal.tsx` - Generic modal for command text or WebNode output with loading and error states.
- `WebEditableText.tsx` - Schema-driven contenteditable text control with line numbers, edit snapshots, and story automation hooks.
- `WebNodeRenderer.tsx` - Core recursive renderer that maps generic WebNode schema elements to interactive Solid UI.
- `WebNodeShadowRoot.tsx` - Mounts WebNode UI in a styled Shadow DOM island and supplies renderer state contexts.

## Notes
- WebNode payload UI is rendered inside scoped Shadow DOM.
- Modal actions consistently use the shared WebButton control.
