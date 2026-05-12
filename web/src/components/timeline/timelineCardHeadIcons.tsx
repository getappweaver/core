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
      viewBox="-2 -2 28 28"
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

export function cardHeadAddIcon(dims?: CardHeadChromeIconDims): JSX.Element {
  const { width, height } = resolveDims(dims);

  return (
    <svg
      class="card-head-chrome-icon"
      width={width}
      height={height}
      viewBox="-2 -2 28 28"
      aria-hidden="true"
    >
      <path
        d="M12.75 9C12.75 8.58579 12.4142 8.25 12 8.25C11.5858 8.25 11.25 8.58579 11.25 9L11.25 11.25H9C8.58579 11.25 8.25 11.5858 8.25 12C8.25 12.4142 8.58579 12.75 9 12.75H11.25V15C11.25 15.4142 11.5858 15.75 12 15.75C12.4142 15.75 12.75 15.4142 12.75 15L12.75 12.75H15C15.4142 12.75 15.75 12.4142 15.75 12C15.75 11.5858 15.4142 11.25 15 11.25H12.75V9Z"
        fill="currentColor"
      />
      <path
        fill-rule="evenodd"
        clip-rule="evenodd"
        d="M12 1.25C6.06294 1.25 1.25 6.06294 1.25 12C1.25 17.9371 6.06294 22.75 12 22.75C17.9371 22.75 22.75 17.9371 22.75 12C22.75 6.06294 17.9371 1.25 12 1.25ZM2.75 12C2.75 6.89137 6.89137 2.75 12 2.75C17.1086 2.75 21.25 6.89137 21.25 12C21.25 17.1086 17.1086 21.25 12 21.25C6.89137 21.25 2.75 17.1086 2.75 12Z"
        fill="currentColor"
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

export function cardHeadChecklistIcon(
  dims?: CardHeadChromeIconDims,
): JSX.Element {
  const { width, height } = resolveDims(dims);

  return (
    <svg
      class="card-head-chrome-icon"
      width={width}
      height={height}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M18 20.75H6C5.27065 20.75 4.57118 20.4603 4.05546 19.9445C3.53973 19.4288 3.25 18.7293 3.25 18V6C3.25 5.27065 3.53973 4.57118 4.05546 4.05546C4.57118 3.53973 5.27065 3.25 6 3.25H14.86C15.0589 3.25 15.2497 3.32902 15.3903 3.46967C15.531 3.61032 15.61 3.80109 15.61 4C15.61 4.19891 15.531 4.38968 15.3903 4.53033C15.2497 4.67098 15.0589 4.75 14.86 4.75H6C5.66848 4.75 5.35054 4.8817 5.11612 5.11612C4.8817 5.35054 4.75 5.66848 4.75 6V18C4.75 18.3315 4.8817 18.6495 5.11612 18.8839C5.35054 19.1183 5.66848 19.25 6 19.25H18C18.3315 19.25 18.6495 19.1183 18.8839 18.8839C19.1183 18.6495 19.25 18.3315 19.25 18V10.29C19.25 10.0911 19.329 9.90032 19.4697 9.75967C19.6103 9.61902 19.8011 9.54 20 9.54C20.1989 9.54 20.3897 9.61902 20.5303 9.75967C20.671 9.90032 20.75 10.0911 20.75 10.29V18C20.75 18.7293 20.4603 19.4288 19.9445 19.9445C19.4288 20.4603 18.7293 20.75 18 20.75Z"
        fill="currentColor"
      />
      <path
        d="M10.5 15.25C10.3071 15.2352 10.1276 15.1455 10 15L7.00001 12C6.93317 11.86 6.91136 11.7028 6.93759 11.5499C6.96382 11.3971 7.03679 11.2561 7.14646 11.1464C7.25613 11.0368 7.3971 10.9638 7.54996 10.9376C7.70282 10.9113 7.86006 10.9331 8.00001 11L10.47 13.47L19 4.99998C19.14 4.93314 19.2972 4.91133 19.4501 4.93756C19.6029 4.96379 19.7439 5.03676 19.8536 5.14643C19.9632 5.2561 20.0362 5.39707 20.0624 5.54993C20.0887 5.70279 20.0669 5.86003 20 5.99998L11 15C10.8724 15.1455 10.693 15.2352 10.5 15.25Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function cardHeadCopyIcon(dims?: CardHeadChromeIconDims): JSX.Element {
  const { width, height } = resolveDims(dims);

  return (
    <svg
      class="chat-copy-btn__icon"
      fill="currentColor"
      width={width}
      height={height}
      viewBox="0 0 16 16"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M14 12V2H4V0h12v12h-2zM0 4h12v12H0V4zm2 2v8h8V6H2z"
        fill-rule="evenodd"
      />
    </svg>
  );
}

export function cardHeadLogIcon(dims?: CardHeadChromeIconDims): JSX.Element {
  const { width, height } = resolveDims(dims);

  return (
    <svg
      class="card-head-chrome-icon"
      width={width}
      height={height}
      viewBox="0 0 512 512"
      aria-hidden="true"
    >
      <g transform="translate(85.572501, 42.666667)">
        <path
          d="M236.349632 0H1.68296533V234.666667H44.349632V42.6666667H218.642965L300.349632 124.373333V234.666667H343.016299V106.666667L236.349632 0ZM0 405.333333V277.360521H28.8096875V382.755208H83.81V405.333333H0ZM153.17 275.102708C173.279583 275.102708 188.692917 281.484792 199.41 294.248958C209.705625 306.47125 214.853437 322.185625 214.853437 341.392083C214.853437 362.404792 208.772396 379.112604 196.610312 391.515521C186.134062 402.232604 171.653958 407.591146 153.17 407.591146C133.060417 407.591146 117.647083 401.209062 106.93 388.444896C96.634375 376.222604 91.4865625 360.267396 91.4865625 340.579271C91.4865625 319.988021 97.5676042 303.490937 109.729687 291.088021C120.266146 280.431146 134.74625 275.102708 153.17 275.102708ZM153.079687 297.680833C142.663646 297.680833 134.625833 302.015833 128.96625 310.685833C123.848542 318.512917 121.289687 328.567708 121.289687 340.850208C121.289687 355.059375 124.330208 366.0775 130.41125 373.904583C136.131042 381.310208 143.717292 385.013021 153.17 385.013021C163.525833 385.013021 171.59375 380.647917 177.37375 371.917708C182.491458 364.211042 185.050312 354.035833 185.050312 341.392083C185.050312 327.483958 182.009792 316.616354 175.92875 308.789271C170.208958 301.383646 162.592604 297.680833 153.079687 297.680833ZM343.91 333.715521V399.011458C336.564583 401.48 331.386667 403.105625 328.37625 403.888333C319.043958 406.356875 309.019271 407.591146 298.302187 407.591146C277.229271 407.591146 261.18375 402.292812 250.165625 391.696146C237.943333 380.015729 231.832187 363.729375 231.832187 342.837083C231.832187 318.813958 239.418437 300.69125 254.590937 288.468958C265.609062 279.558125 280.480521 275.102708 299.205312 275.102708C315.220729 275.102708 330.122292 278.022812 343.91 283.863021L334.065937 306.350833C327.563437 303.099583 321.87375 300.826719 316.996875 299.53224C312.12 298.23776 306.761458 297.590521 300.92125 297.590521C286.952917 297.590521 276.657292 302.13625 270.034375 311.227708C264.435 318.934375 261.635312 329.079479 261.635312 341.663021C261.635312 356.775312 265.849896 368.154687 274.279062 375.801146C281.022396 381.942396 289.391354 385.013021 299.385937 385.013021C305.226146 385.013021 310.765312 384.019583 316.003437 382.032708V356.293646H293.967187V333.715521H343.91Z"
          fill="currentColor"
        />
      </g>
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
