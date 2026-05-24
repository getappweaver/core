export function isWebDemoMode(): boolean {
  return import.meta.env.VITE_APPWEAVER_DEMO === true;
}

export function isEmbeddedWebDemoMode(): boolean {
  return (
    import.meta.env.VITE_APPWEAVER_DEMO === true &&
    import.meta.env.VITE_APPWEAVER_DEMO_EMBEDDED === true
  );
}
