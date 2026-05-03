import type { JSX } from 'solid-js';

/** Default edge length for timeline card chrome glyphs (underscore minimize / expand / dismiss). */
export const CARD_HEAD_CHROME_ICON_PX = 18;

export type CardHeadChromeIconDims = {
  width?: number;
  height?: number;
};

export type CardHeadChromeGlyph = 'underscore' | 'square' | 'close';

function resolveDims(dims: CardHeadChromeIconDims | undefined): {
  width: number;
  height: number;
} {
  const base = CARD_HEAD_CHROME_ICON_PX;
  const width = dims?.width ?? dims?.height ?? base;
  const height = dims?.height ?? dims?.width ?? base;

  return { width, height };
}

const VB = 24;

/** Shared 24×24 viewBox SVGs scaled to width/height (default 18×18). */
export function cardHeadChromeIcon(
  kind: CardHeadChromeGlyph,
  dims?: CardHeadChromeIconDims,
): JSX.Element {
  const { width, height } = resolveDims(dims);

  switch (kind) {
    case 'underscore':
      return (
        <svg
          class="card-head-chrome-icon"
          width={width}
          height={height}
          viewBox={`0 0 ${VB} ${VB}`}
          aria-hidden="true"
        >
          <path
            d="M7 18h10"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="butt"
          />
        </svg>
      );
    case 'square':
      return (
        <svg
          class="card-head-chrome-icon"
          width={width}
          height={height}
          viewBox={`0 0 ${VB} ${VB}`}
          aria-hidden="true"
        >
          <rect
            x="5"
            y="5"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            stroke-width="2.25"
          />
        </svg>
      );
    case 'close':
      return (
        <svg
          class="card-head-chrome-icon"
          width={width}
          height={height}
          viewBox={`0 0 ${VB} ${VB}`}
          aria-hidden="true"
        >
          <path
            d="M6 6l12 12M18 6L6 18"
            fill="none"
            stroke="currentColor"
            stroke-width="2.15"
            stroke-linecap="round"
          />
        </svg>
      );
    default: {
      const _exhaustive: never = kind;

      return _exhaustive;
    }
  }
}

/** Minimize: underscore-style bar (low, typographic “_”). */
export function cardHeadUnderscoreIcon(
  dims?: CardHeadChromeIconDims,
): JSX.Element {
  return cardHeadChromeIcon('underscore', dims);
}

export function cardHeadSquareIcon(dims?: CardHeadChromeIconDims): JSX.Element {
  return cardHeadChromeIcon('square', dims);
}

export function cardHeadCloseIcon(dims?: CardHeadChromeIconDims): JSX.Element {
  return cardHeadChromeIcon('close', dims);
}

const VB_TREE_16 = 16;

/** Inlined from refresh.svg (SVG Repo). */
export function cardHeadTreeRefreshIcon(
  dims?: CardHeadChromeIconDims,
): JSX.Element {
  const { width, height } = resolveDims(dims);

  return (
    <svg
      class="card-head-chrome-icon"
      width={width}
      height={height}
      viewBox={`0 0 ${VB} ${VB}`}
      aria-hidden="true"
    >
      <path
        d="M21.3687 13.5827C21.4144 13.3104 21.2306 13.0526 20.9583 13.0069C20.686 12.9612 20.4281 13.1449 20.3825 13.4173L21.3687 13.5827ZM12 20.5C7.30558 20.5 3.5 16.6944 3.5 12H2.5C2.5 17.2467 6.75329 21.5 12 21.5V20.5ZM3.5 12C3.5 7.30558 7.30558 3.5 12 3.5V2.5C6.75329 2.5 2.5 6.75329 2.5 12H3.5ZM12 3.5C15.3367 3.5 18.2252 5.4225 19.6167 8.22252L20.5122 7.77748C18.9583 4.65062 15.7308 2.5 12 2.5V3.5ZM20.3825 13.4173C19.7081 17.437 16.2112 20.5 12 20.5V21.5C16.7077 21.5 20.6148 18.0762 21.3687 13.5827L20.3825 13.4173Z"
        fill="currentColor"
      />
      <path
        d="M20.4716 2.42157V8.07843H14.8147"
        fill="none"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}

/** Inlined from collapse-all.svg (SVG Repo). */
export function cardHeadTreeCollapseAllIcon(
  dims?: CardHeadChromeIconDims,
): JSX.Element {
  const { width, height } = resolveDims(dims);

  return (
    <svg
      class="card-head-chrome-icon"
      width={width}
      height={height}
      viewBox={`0 0 ${VB_TREE_16} ${VB_TREE_16}`}
      aria-hidden="true"
    >
      <path d="M9 9H4v1h5V9z" fill="currentColor" />
      <path
        fill-rule="evenodd"
        clip-rule="evenodd"
        d="M5 3l1-1h7l1 1v7l-1 1h-2v2l-1 1H3l-1-1V6l1-1h2V3zm1 2h4l1 1v4h2V3H6v2zm4 1H3v7h7V6z"
        fill="currentColor"
      />
    </svg>
  );
}

/** Inlined from expand-all.svg (SVG Repo). */
export function cardHeadTreeExpandAllIcon(
  dims?: CardHeadChromeIconDims,
): JSX.Element {
  const { width, height } = resolveDims(dims);

  return (
    <svg
      class="card-head-chrome-icon"
      width={width}
      height={height}
      viewBox={`0 0 ${VB_TREE_16} ${VB_TREE_16}`}
      aria-hidden="true"
    >
      <path d="M9 9H4v1h5V9z" fill="currentColor" />
      <path d="M7 12V7H6v5h1z" fill="currentColor" />
      <path
        fill-rule="evenodd"
        clip-rule="evenodd"
        d="M5 3l1-1h7l1 1v7l-1 1h-2v2l-1 1H3l-1-1V6l1-1h2V3zm1 2h4l1 1v4h2V3H6v2zm4 1H3v7h7V6z"
        fill="currentColor"
      />
    </svg>
  );
}

export function cardHeadTreeFilterIcon(
  dims?: CardHeadChromeIconDims,
): JSX.Element {
  const { width, height } = resolveDims(dims);

  return (
    <svg
      class="card-head-chrome-icon"
      width={width}
      height={height}
      viewBox="0 0 1024 1024"
      aria-hidden="true"
    >
      <path
        d="M688 312v-48c0-4.4-3.6-8-8-8H296c-4.4 0-8 3.6-8 8v48c0 4.4 3.6 8 8 8h384c4.4 0 8-3.6 8-8zm-392 88c-4.4 0-8 3.6-8 8v48c0 4.4 3.6 8 8 8h184c4.4 0 8-3.6 8-8v-48c0-4.4-3.6-8-8-8H296zm144 452H208V148h560v344c0 4.4 3.6 8 8 8h56c4.4 0 8-3.6 8-8V108c0-17.7-14.3-32-32-32H168c-17.7 0-32 14.3-32 32v784c0 17.7 14.3 32 32 32h272c4.4 0 8-3.6 8-8v-56c0-4.4-3.6-8-8-8zm445.7 51.5l-93.3-93.3C814.7 780.7 828 743.9 828 704c0-97.2-78.8-176-176-176s-176 78.8-176 176 78.8 176 176 176c35.8 0 69-10.7 96.8-29l94.7 94.7c1.6 1.6 3.6 2.3 5.6 2.3s4.1-.8 5.6-2.3l31-31a7.9 7.9 0 0 0 0-11.2zM652 816c-61.9 0-112-50.1-112-112s50.1-112 112-112 112 50.1 112 112-50.1 112-112 112z"
        fill="currentColor"
      />
    </svg>
  );
}

export function cardHeadStoryPlayIcon(
  dims?: CardHeadChromeIconDims,
): JSX.Element {
  const { width, height } = resolveDims(dims);

  return (
    <svg
      class="card-head-chrome-icon"
      width={width}
      height={height}
      viewBox={`0 0 ${VB} ${VB}`}
      aria-hidden="true"
    >
      <path d="M8 5v14l11-7L8 5z" fill="currentColor" />
    </svg>
  );
}

export function cardHeadStoryPauseIcon(
  dims?: CardHeadChromeIconDims,
): JSX.Element {
  const { width, height } = resolveDims(dims);

  return (
    <svg
      class="card-head-chrome-icon"
      width={width}
      height={height}
      viewBox={`0 0 ${VB} ${VB}`}
      aria-hidden="true"
    >
      <path d="M7 5h4v14H7V5zm6 0h4v14h-4V5z" fill="currentColor" />
    </svg>
  );
}

export function cardHeadStoryPreviousIcon(
  dims?: CardHeadChromeIconDims,
): JSX.Element {
  const { width, height } = resolveDims(dims);

  return (
    <svg
      class="card-head-chrome-icon"
      width={width}
      height={height}
      viewBox={`0 0 ${VB} ${VB}`}
      aria-hidden="true"
    >
      <path d="M6 5h2v14H6V5zm3 7l9 7V5l-9 7z" fill="currentColor" />
    </svg>
  );
}

export function cardHeadStoryNextIcon(
  dims?: CardHeadChromeIconDims,
): JSX.Element {
  const { width, height } = resolveDims(dims);

  return (
    <svg
      class="card-head-chrome-icon"
      width={width}
      height={height}
      viewBox={`0 0 ${VB} ${VB}`}
      aria-hidden="true"
    >
      <path d="M16 5h2v14h-2V5zM6 19l9-7-9-7v14z" fill="currentColor" />
    </svg>
  );
}

export function cardHeadSpeakerIcon(
  dims?: CardHeadChromeIconDims,
): JSX.Element {
  const { width, height } = resolveDims(dims);

  return (
    <svg
      class="card-head-chrome-icon"
      width={width}
      height={height}
      viewBox={`0 0 ${VB} ${VB}`}
      aria-hidden="true"
    >
      <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
      <path
        d="M16 8.5a5 5 0 0 1 0 7M18.4 6a8 8 0 0 1 0 12"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
      />
    </svg>
  );
}
