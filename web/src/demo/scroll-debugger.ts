type ScrollDebugEntry = {
  method: string;
  target: string;
  args: unknown[];
  caller: string;
  timestamp: number;
  stack: string | undefined;
};

type ScrollDebugGlobal = Window & {
  appweaverScrollDebugger?: ScrollDebugger;
};

type WrappedWindowMethod = 'scroll' | 'scrollBy' | 'scrollTo';
type WrappedElementMethod = 'scrollBy' | 'scrollIntoView' | 'scrollTo';

class ScrollDebugger {
  private scrollLog: ScrollDebugEntry[] = [];
  private enabled = true;

  constructor() {
    this.wrapWindowMethod('scroll');
    this.wrapWindowMethod('scrollBy');
    this.wrapWindowMethod('scrollTo');
    this.wrapElementMethod('scrollBy');
    this.wrapElementMethod('scrollIntoView');
    this.wrapElementMethod('scrollTo');
    this.wrapFocusMethod();
    this.wrapScrollPositionProperty('scrollTop');
    this.wrapScrollPositionProperty('scrollLeft');
  }

  getReport(): ScrollDebugEntry[] {
    return [...this.scrollLog];
  }

  clear(): void {
    this.scrollLog = [];
  }

  disable(): void {
    this.enabled = false;
  }

  enable(): void {
    this.enabled = true;
  }

  private wrapWindowMethod(methodName: WrappedWindowMethod): void {
    const original = window[methodName];

    if (typeof original !== 'function') {
      return;
    }

    const self = this;
    window[methodName] = function wrappedWindowScrollMethod(...args: never[]) {
      if (!self.enabled) {
        return original.apply(this, args);
      }

      self.record({ methodName, target: 'window', args, element: window });

      return original.apply(this, args);
    } as typeof original;
  }

  private wrapElementMethod(methodName: WrappedElementMethod): void {
    const original = Element.prototype[methodName];

    if (typeof original !== 'function') {
      return;
    }

    const self = this;
    Object.defineProperty(Element.prototype, methodName, {
      value(this: Element, ...args: unknown[]) {
        if (!self.enabled) {
          return original.apply(this, args as never[]);
        }

        self.record({ methodName, target: 'element', args, element: this });

        return original.apply(this, args as never[]);
      },
      writable: true,
      configurable: true,
    });
  }

  private wrapFocusMethod(): void {
    const original = HTMLElement.prototype.focus;

    if (typeof original !== 'function') {
      return;
    }

    const self = this;
    Object.defineProperty(HTMLElement.prototype, 'focus', {
      value(this: HTMLElement, ...args: unknown[]) {
        if (!self.enabled) {
          return original.apply(this, args as never[]);
        }

        self.record({ methodName: 'focus', target: 'element', args, element: this });

        return original.apply(this, args as never[]);
      },
      writable: true,
      configurable: true,
    });
  }

  private wrapScrollPositionProperty(propertyName: 'scrollLeft' | 'scrollTop'): void {
    const descriptor = findPropertyDescriptor(Element.prototype, propertyName);

    if (!descriptor?.get || !descriptor.set) {
      return;
    }

    const self = this;
    Object.defineProperty(Element.prototype, propertyName, {
      get(this: Element) {
        return descriptor.get!.call(this) as number;
      },
      set(this: Element, value: number) {
        if (self.enabled) {
          self.record({
            methodName: `${propertyName} setter`,
            target: 'element',
            args: [value],
            element: this,
          });
        }

        descriptor.set!.call(this, value);
      },
      configurable: true,
    });
  }

  private record(props: {
    methodName: string;
    target: string;
    args: unknown[];
    element: unknown;
  }): void {
    const stack = new Error().stack;
    const caller = extractCaller(stack);
    const entry = {
      method: props.methodName,
      target: props.target,
      args: props.args,
      caller,
      timestamp: Date.now(),
      stack,
    };

    this.scrollLog.push(entry);
    console.group(`[AppWeaver demo scroll] ${props.methodName}`);
    console.log('Called from:', caller);
    console.log('Arguments:', props.args);
    console.log('Target:', props.element);
    console.log('Stack:', stack);
    console.groupEnd();
  }
}

function findPropertyDescriptor(
  prototype: object,
  propertyName: 'scrollLeft' | 'scrollTop',
): PropertyDescriptor | undefined {
  let current: object | null = prototype;

  while (current) {
    const descriptor = Object.getOwnPropertyDescriptor(current, propertyName);

    if (descriptor) {
      return descriptor;
    }

    current = Object.getPrototypeOf(current) as object | null;
  }

  return undefined;
}

function extractCaller(stack: string | undefined): string {
  const lines = stack?.split('\n') ?? [];

  for (const line of lines.slice(3, 15)) {
    if (
      line &&
      !line.includes('ScrollDebugger') &&
      !line.includes('wrappedWindowScrollMethod')
    ) {
      return line.trim().replace(/^at\s+/, '');
    }
  }

  return 'unknown';
}

export function installDemoScrollDebugger(): void {
  if (typeof window === 'undefined') {
    return;
  }

  const global = window as ScrollDebugGlobal;

  if (global.appweaverScrollDebugger) {
    return;
  }

  global.appweaverScrollDebugger = new ScrollDebugger();
  console.info(
    '[AppWeaver demo scroll] debugger installed. Use window.appweaverScrollDebugger.getReport().',
  );
}
