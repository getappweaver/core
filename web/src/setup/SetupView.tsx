import type { JSX } from 'solid-js';
import {
  createEffect,
  createResource,
  createSignal,
  Match,
  Show,
  Switch,
} from 'solid-js';

import { CashuSetupCard } from './components/CashuSetupCard';
import { CursorSetupCard } from './components/CursorSetupCard';
import { NostrToolingCard } from './components/NostrToolingCard';
import { OpenCodeAuthCard } from './components/OpenCodeAuthCard';
import { PiperSetupCard } from './components/PiperSetupCard';
import { SetupChrome } from './components/SetupChrome';
import { SetupCompletionCard } from './components/SetupCompletionCard';
import { SetupStatusCard } from './components/SetupStatusCard';
import { SetupTimelineCard } from './components/SetupTimelineCard';
import { SystemCheckCard } from './components/SystemCheckCard';
import { WebPushSetupCard } from './components/WebPushSetupCard';
import {
  fetchSetupStatus,
  initializeSetupSession,
  type SetupStatus,
} from './transport';

export function SetupView(): JSX.Element {
  const [setupToken] = createResource(initializeSetupSession);

  const [latestStatus, setLatestStatus] = createSignal<SetupStatus | null>(
    null,
  );

  const [status, { refetch }] = createResource(
    () => setupToken() ?? null,
    async (token) => fetchSetupStatus(token),
  );

  createEffect(() => {
    const next = status();

    if (next) {
      setLatestStatus(next);
    }
  });

  return (
    <SetupChrome>
      <main class="setup-shell">
        <Switch>
          <Match when={setupToken() === null}>
            <section class="card setup-card setup-card--error">
              <h1>Missing setup access</h1>
              <p class="setup-copy">
                Open the setup URL printed in the server logs. The boot secret
                is exchanged for a local setup session and removed from the URL.
              </p>
            </section>
          </Match>

          <Match when={setupToken.error || status.error}>
            <section class="card setup-card setup-card--error">
              <h1>Setup access failed</h1>
              <p class="setup-copy">
                The setup secret was rejected or the setup API is unavailable.
                Restart AppWeaver and use the latest setup URL from the logs.
              </p>
              <pre class="setup-error-detail">
                {String(setupToken.error ?? status.error)}
              </pre>
            </section>
          </Match>

          <Match
            when={(setupToken.loading || status.loading) && !latestStatus()}
          >
            <section class="card setup-card">
              <h1>Checking configuration...</h1>
              <p class="setup-copy">
                Reading setup status from the local server.
              </p>
            </section>
          </Match>

          <Match when={latestStatus()}>
            {(loaded) => (
              <>
                <SystemCheckCard status={loaded()} />
                <NostrToolingCard />
                <SetupTimelineCard
                  token={setupToken()!}
                  status={loaded()}
                  onSaved={() => void refetch()}
                />
                <CashuSetupCard
                  token={setupToken()!}
                  status={loaded()}
                  onSaved={() => void refetch()}
                />
                <OpenCodeAuthCard token={setupToken()!} status={loaded()} />
                <CursorSetupCard
                  token={setupToken()!}
                  status={loaded()}
                  onSaved={() => void refetch()}
                />
                <WebPushSetupCard
                  token={setupToken()!}
                  status={loaded()}
                  onSaved={() => void refetch()}
                />
                <PiperSetupCard
                  token={setupToken()!}
                  status={loaded()}
                  onSaved={() => void refetch()}
                />
                <SetupStatusCard status={loaded()} />
                <SetupCompletionCard token={setupToken()!} status={loaded()} />
              </>
            )}
          </Match>
        </Switch>

        <Show when={setupToken()}>
          <p class="setup-footnote">
            Setup access is using an in-memory local session. Restart AppWeaver
            to invalidate setup sessions.
          </p>
        </Show>
      </main>
    </SetupChrome>
  );
}
