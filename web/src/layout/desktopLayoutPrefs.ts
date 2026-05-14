export type DockPosition = 'left' | 'right' | 'hidden';

export type LayoutPrefs = {
  dockPosition: DockPosition;
  dockResizable: boolean;
  dockWidthPx: number;
  /** 0 means unlimited expanded dock cards. */
  dockExpandedLimit: number;
};

export const DESKTOP_LAYOUT_STORAGE_KEY = 'appweaver.desktop-layout';

export const DEFAULT_LAYOUT_PREFS: LayoutPrefs = {
  dockPosition: 'left',
  dockResizable: true,
  dockWidthPx: 360,
  dockExpandedLimit: 1,
};

const MIN_DOCK_WIDTH_PX = 260;
const MAX_DOCK_WIDTH_PX = 520;

function isDockPosition(value: unknown): value is DockPosition {
  return value === 'left' || value === 'right' || value === 'hidden';
}

export function clampDockWidth(value: number): number {
  return Math.min(MAX_DOCK_WIDTH_PX, Math.max(MIN_DOCK_WIDTH_PX, value));
}

function normalizeDockExpandedLimit(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_LAYOUT_PREFS.dockExpandedLimit;
  }

  return Math.max(0, Math.floor(value));
}

export function readLayoutPrefs(): LayoutPrefs {
  try {
    const raw = window.localStorage.getItem(DESKTOP_LAYOUT_STORAGE_KEY);

    if (!raw) {
      return DEFAULT_LAYOUT_PREFS;
    }

    const parsed = JSON.parse(raw) as Partial<LayoutPrefs>;

    return {
      dockPosition: isDockPosition(parsed.dockPosition)
        ? parsed.dockPosition
        : DEFAULT_LAYOUT_PREFS.dockPosition,
      dockResizable:
        typeof parsed.dockResizable === 'boolean'
          ? parsed.dockResizable
          : DEFAULT_LAYOUT_PREFS.dockResizable,
      dockWidthPx:
        typeof parsed.dockWidthPx === 'number'
          ? clampDockWidth(parsed.dockWidthPx)
          : DEFAULT_LAYOUT_PREFS.dockWidthPx,
      dockExpandedLimit: normalizeDockExpandedLimit(parsed.dockExpandedLimit),
    };
  } catch {
    return DEFAULT_LAYOUT_PREFS;
  }
}
