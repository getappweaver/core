import { splitProps, type Component, type JSX } from 'solid-js';

/** Default; must match `translate(4px, 4px)` on `:active` in `styles.css` and `base-web-ui.css`. */
export const WEB_BUTTON_DEFAULT_ACTIVE_TRANSLATE_PX = 4;

export type WebButtonProps = Omit<
  JSX.ButtonHTMLAttributes<HTMLButtonElement>,
  'onClick'
> & {
  onClick?: (event: MouseEvent) => void;
  /**
   * Pixel offset of `:active` `translate(x, x)` for pre-translate hit-testing (see component).
   * Defaults to {@link WEB_BUTTON_DEFAULT_ACTIVE_TRANSLATE_PX}.
   */
  activeTranslatePx?: number;
};

function assignRefProp(
  el: HTMLButtonElement,
  ref: JSX.ButtonHTMLAttributes<HTMLButtonElement>['ref'],
): void {
  if (ref == null) {
    return;
  }

  if (typeof ref === 'function') {
    ref(el);

    return;
  }

  if (typeof ref !== 'object' || ref === null || ref instanceof HTMLElement) {
    return;
  }

  const signalLike = ref as { value?: HTMLButtonElement | null };

  if ('value' in signalLike) {
    signalLike.value = el;
  }
}

export const WebButton: Component<WebButtonProps> = (props) => {
  const [local, rest] = splitProps(props, ['onClick', 'children', 'ref']);

  const onClick: JSX.EventHandler<HTMLButtonElement, MouseEvent> = (event) => {
    local.onClick?.(event);
  };

  return (
    <button
      {...rest}
      ref={(el) => {
        assignRefProp(el, local.ref);
      }}
      onClick={onClick}
    >
      {local.children}
    </button>
  );
};
