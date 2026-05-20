const PLUGIN_INSTALL_RESTART_STATUS_KEY =
  'appweaver.pluginInstallRestartStatus';

const PLUGIN_INSTALL_RESTART_STATUS_MAX_AGE_MS = 120_000;

type PluginInstallRestartStatus = {
  startedAt: number;
  title: string;
  restarting: string;
  success: string;
  restartAnnounced: boolean;
};

function readStatus(): PluginInstallRestartStatus | null {
  const raw = window.localStorage.getItem(PLUGIN_INSTALL_RESTART_STATUS_KEY);

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<PluginInstallRestartStatus>;

    if (
      typeof parsed.startedAt !== 'number' ||
      typeof parsed.title !== 'string' ||
      typeof parsed.restarting !== 'string' ||
      typeof parsed.success !== 'string' ||
      typeof parsed.restartAnnounced !== 'boolean'
    ) {
      return null;
    }

    if (
      Date.now() - parsed.startedAt >
      PLUGIN_INSTALL_RESTART_STATUS_MAX_AGE_MS
    ) {
      clearPluginInstallRestartStatus();

      return null;
    }

    return {
      startedAt: parsed.startedAt,
      title: parsed.title,
      restarting: parsed.restarting,
      success: parsed.success,
      restartAnnounced: parsed.restartAnnounced,
    };
  } catch {
    clearPluginInstallRestartStatus();

    return null;
  }
}

function writeStatus(status: PluginInstallRestartStatus): void {
  window.localStorage.setItem(
    PLUGIN_INSTALL_RESTART_STATUS_KEY,
    JSON.stringify(status),
  );
}

export function beginPluginInstallRestartStatus(props: {
  title: string;
  restarting: string;
  success: string;
}): void {
  writeStatus({
    startedAt: Date.now(),
    title: props.title,
    restarting: props.restarting,
    success: props.success,
    restartAnnounced: false,
  });
}

export function consumePluginInstallRestartMessage(): string | null {
  const status = readStatus();

  if (!status || status.restartAnnounced) {
    return null;
  }

  writeStatus({ ...status, restartAnnounced: true });

  return status.restarting;
}

export function consumePluginInstallSuccessMessage(): string | null {
  const status = readStatus();

  if (!status || !status.restartAnnounced) {
    return null;
  }

  clearPluginInstallRestartStatus();

  return status.success;
}

export function hasActivePluginInstallRestartStatus(): boolean {
  return readStatus() !== null;
}

export function clearPluginInstallRestartStatus(): void {
  window.localStorage.removeItem(PLUGIN_INSTALL_RESTART_STATUS_KEY);
}
