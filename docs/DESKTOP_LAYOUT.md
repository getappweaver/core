# Desktop Layout

## Goal

Use wide desktop screens as a workspace instead of stretching the chat timeline and singleton widgets across the full viewport.

Mobile keeps the current simple layout and widget behavior.

## Target Layout

Desktop with a left dock:

```text
┌──────────────────────┬──────────────────────────────────────┐
│ Singleton Widgets    │ Topbar: layout/status/account         │
│                      │                                      │
│ [Todos] [Files] ...  │ Timeline                             │
│                      │                                      │
│ Todo Card            │ Chatbox                              │
│ Files Card           │ Palette                              │
└──────────────────────┴──────────────────────────────────────┘
```

Desktop with a right dock:

```text
┌──────────────────────────────────────┬──────────────────────┐
│ Topbar: layout/status/account         │ Singleton Widgets    │
│ Timeline                             │                      │
│ Chatbox                              │ [Todos] [Files] ...  │
│ Palette                              │ Opened widget cards  │
└──────────────────────────────────────┴──────────────────────┘
```

Dock hidden keeps the current main-app-only layout.

## Layout Preferences

Persist desktop layout preferences in `localStorage`.

```ts
type DockPosition = 'left' | 'right' | 'hidden';

type LayoutPrefs = {
  dockPosition: DockPosition;
  dockResizable: boolean;
  dockWidthPx: number;
};
```

Default preferences:

```ts
{
  dockPosition: 'left',
  dockResizable: true,
  dockWidthPx: 360,
}
```

The dock applies only on desktop or wide screens. Below the desktop breakpoint, the app ignores the dock and keeps the existing mobile layout.

## Layout Button

Add a desktop-only layout button in the main topbar, near account/status controls.

Clicking it opens a singleton-style layout settings card in the timeline. Changing settings updates the layout live so the user can see the result immediately.

Settings:

```text
Dock position
Left ✓
Right
Hidden

Resizable ✓
```

## Singleton Dock Behavior

The dock has widget buttons at the top. Multiple singleton widgets can be open at the same time.

Widget button behavior:

- Closed widget click: open it in the dock.
- Open widget click: focus or scroll to the opened card.
- Minimized widget click: maximize it again and focus it.
- Open visible widget click: focus only; do not close it.
- Closing is explicit from the card header.

Widget card behavior:

- Minimize keeps the card open and collapses its body.
- Close removes the card from the dock.
- Open buttons use an active background.
- Minimized buttons can use a muted active state.
- Closed buttons use the normal or gray state.

## Header Widget Behavior

Desktop with dock visible:

- Singleton widget buttons move from `.topbar-actions` into the dock header.
- Modal widget buttons stay in the main topbar.
- Account, bot status, and layout controls stay in the main topbar.

Desktop with dock hidden:

- Singleton widget buttons stay in the header, preserving the current layout.

Mobile:

- Current header/menu widget behavior stays unchanged.

## File Widget

The File widget button should open the singleton file widget in the dock on desktop once dock widget routing is implemented.

The file widget is a natural persistent workspace panel because users often want files visible while chatting with the bot.

## Main Content Width

Once the dock exists, the main timeline/composer column can use a readable desktop width around `40rem`.

Wide content will need escape hatches later, such as wide cards, full-width cards, or horizontal scrolling for logs, diffs, tables, and file views.

## Implementation Phases

### Phase 1: Desktop Workspace Shell

- Add persisted layout preferences.
- Add desktop workspace shell structure.
- Add dock position and width CSS.
- Add the resizer foundation.
- Keep widget behavior unchanged.

### Phase 2: Dock Widget Buttons

- Add a `SingletonDock` component.
- Render singleton widget buttons in the dock on desktop when the dock is visible.
- Keep mobile behavior unchanged.
- Preserve story targets with `data-story-target="header-widget:command:subcommand"`.

### Phase 3: Docked Singleton Cards

- Render singleton command result cards inside the dock.
- Support multiple open widgets.
- Support minimized and closed states.
- Clicking an open widget button focuses it.
- Clicking a minimized widget button restores and focuses it.

### Phase 4: Layout Settings Singleton

- Add the desktop-only layout button.
- Open layout settings as a singleton timeline card.
- Apply changes live.
- Save changes to `localStorage`.

### Phase 5: File Widget Routing And Polish

- Route the File widget button to the docked singleton version on desktop.
- Add focus highlight and scroll-into-view behavior.
- Tune dock button active, minimized, and closed states.

## Acceptance Criteria

- Mobile layout and widget behavior remain unchanged.
- Desktop dock defaults to the left.
- Dock can support left, right, and hidden positions.
- Dock width and layout preferences survive reload.
- Dock can be resized when resizable is enabled.
- Multiple singleton widgets can be open at once after docked cards are implemented.
- Clicking an open widget button focuses it.
- Clicking a minimized widget button restores and focuses it.
- Closing a card deactivates its button.
- Main timeline, chatbox, and palette stay in the main app area.
- Account, status, and layout controls stay in the main topbar.
