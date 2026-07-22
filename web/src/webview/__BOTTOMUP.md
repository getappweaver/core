---
direct_hash: 520abc51b5fdd8b81fce134b4798430c6d28560772998dd6d995691a2a379934
subtree_hash: 3f770dd30db6510968e7dda0c78079393855369fbf8fa434923be4a0ef6f0059
files:
  base-web-ui.css: 59d2610afd9203fde39e6c04dcc99ed7f722ff6dd9766b6b3b99ef716ae4c7a6
  web-overflow-panel.css: 0c063dd8fccf7f34b9a2f0742a45fc77f6017a3d13d7e85673df183a1533cd3f
children:
---

# web/src/webview

## Purpose
Shadow-DOM webview styling for rendered WebNode UI lives here. It defines the compact retro terminal visual system used by embedded command output, Nostr cards, forms, trees, buttons, and overflow menus.

## Files
- `base-web-ui.css` - Scoped base stylesheet for WebNodeRoot rendering inside Shadow DOM, covering layout primitives, controls, forms, trees, command status, Nostr post/profile widgets, and interaction states.
- `web-overflow-panel.css` - Shared absolute-positioned overflow menu panel styling and menu button behavior for both Shadow DOM webviews and the main app.

## Notes
- Styles assume inherited app-level CSS variables on the shadow host.
- Overflow panel styles are shared with the main app via import/concatenation.
