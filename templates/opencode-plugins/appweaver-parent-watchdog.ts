let watchingParent = false;

/** Child-side fallback when AppWeaver disappears before normal SDK cleanup runs. */
export const AppWeaverParentWatchdogPlugin = async () => {
  const rawParentPid = process.env.APPWEAVER_PARENT_PID;
  const parentPid = rawParentPid ? Number.parseInt(rawParentPid, 10) : Number.NaN;

  if (!watchingParent && Number.isInteger(parentPid) && parentPid > 1) {
    watchingParent = true;

    const timer = setInterval(() => {
      try {
        // Signal zero probes existence; it does not terminate the parent.
        process.kill(parentPid, 0);
      } catch (err) {
        const code = (err as NodeJS.ErrnoException | null)?.code;

        if (code !== 'EPERM') {
          process.exit(0);
        }
      }
    }, 2_000);

    timer.unref?.();
  }

  return {};
};
