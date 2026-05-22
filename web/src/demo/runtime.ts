export function isWebDemoMode(): boolean {
  return import.meta.env.VITE_APPWEAVER_DEMO === true;
}
