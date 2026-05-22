export function isDemoMode(): boolean {
  return (
    process.argv.slice(2).includes('--demo') ||
    process.env.APPWEAVER_DEMO === '1'
  );
}
