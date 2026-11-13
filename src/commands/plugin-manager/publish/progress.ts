import type { RouteCommandContext } from '@src/commands/dispatch';
import { encodeCommandStatus } from '@src/web/command-status';

type ProgressUpdate = {
  state: 'pending' | 'success' | 'warning' | 'error';
  message: string;
  diagnostic: 'warning' | 'error' | null;
};

/** Request-local history: no signer credentials or event content are recorded. */
export function publicationProgress(ctx: RouteCommandContext, stream: boolean) {
  const started = Date.now();
  const history: string[] = [];
  let message = 'Preparing publication';
  let state: ProgressUpdate['state'] = 'pending';
  let stopped = false;
  let queue = Promise.resolve();

  const send = () => {
    if (!stream || ctx.source !== 'web' || !ctx.sendReply) {
      return;
    }

    const reply = encodeCommandStatus({
      id: `plugins-publish-status-${ctx.args[1]}`,
      state,
      message: `${message} · ${Math.floor((Date.now() - started) / 1000)}s elapsed`,
      output: history.length > 0 ? history.join('\n') : null,
      progress: state === 'pending' ? null : 1,
    });

    queue = queue
      .then(async () => {
        await ctx.sendReply?.(reply);
      })
      .catch(() => {});
  };

  const timer =
    stream && ctx.source === 'web'
      ? setInterval(() => {
          if (!stopped) {
            send();
          }
        }, 1000)
      : null;

  return {
    update(update: ProgressUpdate) {
      if (stopped || state !== 'pending') {
        return;
      }

      state = update.state;
      message = update.message;

      if (update.diagnostic) {
        history.push(
          `${Math.floor((Date.now() - started) / 1000)}s  ${update.diagnostic}: ${message}`,
        );
      }

      send();
    },
    currentMessage() {
      return message;
    },
    history() {
      return history.join('\n');
    },
    async stop() {
      stopped = true;

      if (timer !== null) {
        clearInterval(timer);
      }

      await queue;
    },
  };
}
