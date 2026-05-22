export function isWebDemoMode(): boolean {
  return import.meta.env.VITE_APPWEAVER_DEMO === true;
}

let demoFocusGuardInstalled = false;

export function installWebDemoFocusGuard(): void {
  if (!isWebDemoMode() || demoFocusGuardInstalled) {
    return;
  }

  demoFocusGuardInstalled = true;

  HTMLElement.prototype.focus = function focusNoop(): void {
    // The embedded landing demo should never scroll the host page due to
    // programmatic focus. Pointer/key focus from real user interaction remains.
  };
}
