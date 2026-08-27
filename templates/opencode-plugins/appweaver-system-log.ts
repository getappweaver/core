import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

let lastFilenameTimestamp = 0;

function nextTimestamp(): { iso: string; filename: string } {
  const timestamp = Math.max(Date.now(), lastFilenameTimestamp + 1);
  lastFilenameTimestamp = timestamp;
  const iso = new Date(timestamp).toISOString();

  return { iso, filename: iso.replaceAll(':', '-') };
}

function safeSessionId(sessionId: string): string {
  return sessionId.replaceAll(/[^a-zA-Z0-9._-]/g, '_');
}

export const AppWeaverSystemLogPlugin = async () => {
  if (process.env.OPENCODE_SYSTEM_LOG !== '1') {
    return {};
  }

  const appweaverRoot = process.env.APPWEAVER_ROOT;

  if (!appweaverRoot) {
    throw new Error('APPWEAVER_ROOT is required for OpenCode system logging.');
  }

  const logDir = join(appweaverRoot, '.logs', 'system');
  await mkdir(logDir, { recursive: true, mode: 0o700 });
  await chmod(logDir, 0o700);

  return {
    'experimental.chat.system.transform': async (
      input: {
        sessionID?: string;
        model: { providerID: string; id: string };
      },
      output: { system: string[] },
    ) => {
      if (!input.sessionID) {
        return;
      }

      const timestamp = nextTimestamp();
      const filename = `${timestamp.filename}-${safeSessionId(input.sessionID)}.json`;

      await writeFile(
        join(logDir, filename),
        `${JSON.stringify(
          {
            timestamp: timestamp.iso,
            sessionId: input.sessionID,
            model: input.model,
            system: output.system,
          },
          null,
          2,
        )}\n`,
        { encoding: 'utf8', mode: 0o600, flag: 'wx' },
      );
    },
  };
};
