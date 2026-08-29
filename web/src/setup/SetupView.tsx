import type { JSX } from 'solid-js';
import {
  createEffect,
  createResource,
  createSignal,
  Match,
  Show,
  Switch,
} from 'solid-js';

import { ConnectOverlays } from '../connect/ConnectOverlays';
import { useConnect } from '../connect/useConnect';
import { useNostrAuth } from '../contexts/NostrAuthContext';

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
  fetchSetupAuth,
  fetchSetupStatus,
  getStoredSetupSessionToken,
  initializeSetupSession,
  type SetupStatus,
} from './transport';

export function SetupView(): JSX.Element {
  const auth = useNostrAuth();
  const connect = useConnect({ auth });
  const [setupAuth] = createResource(fetchSetupAuth);

  const setupSessionSource = () => {
    const configuredAuth = setupAuth();

    if (!configuredAuth) {
      return null;
    }

    if (getStoredSetupSessionToken()) {
      return 'stored';
    }

    if (configuredAuth.method === 'secret') {
      return 'secret';
    }

    const state = auth.authState();

    return state.status === 'connected' ? `nostr:${state.pubkey}` : null;
  };

  const [setupSession] = createResource(setupSessionSource, async () => {
    const configuredAuth = setupAuth();

    if (!configuredAuth) {
      return null;
    }

    return initializeSetupSession({
      auth: configuredAuth,
      getNip98Token: auth.getNip98Token,
    });
  });

  const setupToken = () => {
    const result = setupSession();

    return result?.success ? result.token : null;
  };

  const setupSessionFailure = () => {
    const result = setupSession();

    return result && !result.success ? result : null;
  };

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

  const setupAccessError = () =>
    setupSessionFailure()?.reason === 'missing_setup_secret'
      ? null
      : (setupSessionFailure()?.error ?? setupSession.error ?? status.error);

  const wrongNostrPubkey = () =>
    setupSessionFailure()?.reason === 'wrong_pubkey';

  return (
    <>
      <SetupChrome>
        <main class="setup-shell">
          <Switch>
            <Match when={setupAuth.error}>
              <section class="card setup-card setup-card--error">
                <h1>Setup authentication unavailable</h1>
                <pre class="setup-error-detail">{String(setupAuth.error)}</pre>
              </section>
            </Match>

            <Match when={setupAuth.loading}>
              <section class="card setup-card">
                <h1>Checking setup access...</h1>
              </section>
            </Match>

            <Match when={setupAccessError()}>
              <section class="card setup-card setup-card--error">
                <h1>Setup access failed</h1>
                <p class="setup-copy">
                  {wrongNostrPubkey()
                    ? 'The connected Nostr signer does not match the master pubkey configured for this AppWeaver instance.'
                    : 'Setup authentication was rejected or the setup API is unavailable. Verify the setup secret or connect the configured master Nostr key.'}
                </p>
                <pre class="setup-error-detail">
                  {String(setupAccessError())}
                </pre>
                <Show when={setupAuth()?.method === 'nostr'}>
                  <button
                    type="button"
                    class="web-button"
                    title={connect.manageTitle()}
                    onClick={connect.handleConnectMenuClick}
                  >
                    Manage Nostr signer
                  </button>
                </Show>
              </section>
            </Match>

            <Match
              when={
                setupAuth()?.method === 'nostr' &&
                !setupToken() &&
                !setupSession.loading &&
                !setupSessionFailure() &&
                !setupSession.error
              }
            >
              <section class="card setup-card">
                <h1>Authenticate with Nostr</h1>
                <p class="setup-copy">
                  Connect and sign with the master Nostr key configured for this
                  AppWeaver instance.
                </p>
                <button
                  type="button"
                  class="web-button"
                  title={connect.manageTitle()}
                  onClick={connect.handleConnectMenuClick}
                >
                  {connect.connectLabel()}
                </button>
              </section>
            </Match>

            <Match
              when={setupSessionFailure()?.reason === 'missing_setup_secret'}
            >
              <section class="card setup-card setup-card--error">
                <h1>Missing setup access</h1>
                <p class="setup-copy">
                  Open the setup URL printed in the server logs. The boot secret
                  is exchanged for a local setup session and removed from the
                  URL.
                </p>
              </section>
            </Match>

            <Match
              when={
                (setupSession.loading ||
                  (Boolean(setupToken()) && status.loading)) &&
                !latestStatus()
              }
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
                  <SetupStatusCard
                    status={loaded()}
                    authMethod={setupAuth()?.method ?? 'secret'}
                  />
                  <SetupCompletionCard
                    token={setupToken()!}
                    status={loaded()}
                  />
                </>
              )}
            </Match>
          </Switch>

          <Show when={setupToken()}>
            <p class="setup-footnote">
              Setup access is using an in-memory local session. Restart
              AppWeaver to invalidate setup sessions.
            </p>
          </Show>
        </main>
      </SetupChrome>
      <ConnectOverlays auth={auth} connect={connect} />
    </>
  );
}
