import type { JSX } from 'solid-js';
import {
  createResource,
  createSignal,
  For,
  Match,
  Show,
  Switch,
} from 'solid-js';

import { HeaderChrome } from '../chrome/HeaderChrome';
import { ConnectOverlays } from '../connect/ConnectOverlays';
import { useConnect } from '../connect/useConnect';
import { useNostrAuth } from '../contexts/NostrAuthContext';

import {
  fetchSetupStatus,
  generateSetupBotKey,
  getSetupSecretFromUrl,
  setSetupMasterPubkey,
  setSetupRelays,
  type SetupStatus,
} from './transport';

type StatusRowProps = {
  label: string;
  ok: boolean;
  detail: string;
};

function StatusRow(props: StatusRowProps): JSX.Element {
  return (
    <li class="setup-status-row">
      <span
        class="setup-status-dot"
        classList={{ 'is-ok': props.ok, 'is-missing': !props.ok }}
        aria-hidden="true"
      />
      <span class="setup-status-label">{props.label}</span>
      <span class="setup-status-detail">{props.detail}</span>
    </li>
  );
}

function setupRows(status: SetupStatus): StatusRowProps[] {
  return [
    {
      label: 'Bot key',
      ok: status.env.botKey,
      detail: status.env.botKey ? 'configured' : 'missing',
    },
    {
      label: 'Master pubkey',
      ok: status.env.masterPubkey,
      detail: status.env.masterPubkey ? 'configured' : 'missing',
    },
    {
      label: 'Relays',
      ok: status.env.relays,
      detail: status.env.relays
        ? `${status.runtime.relayCount} configured`
        : 'missing',
    },
    {
      label: 'Cashu wallet',
      ok: status.env.cashuMnemonic,
      detail: status.env.cashuMnemonic ? 'configured' : 'optional',
    },
    {
      label: 'Web push',
      ok: status.env.webPush,
      detail: status.env.webPush ? 'configured' : 'optional',
    },
  ];
}

function SetupStatusCard(props: { status: SetupStatus }): JSX.Element {
  const status = () => props.status;

  return (
    <section class="card setup-card" aria-labelledby="setup-title">
      <div class="setup-card-head">
        <div>
          <p class="setup-kicker">AppWeaver Setup</p>
          <h1 id="setup-title">Configuration Status</h1>
        </div>
        <span class="setup-badge" classList={{ 'is-ok': status().configured }}>
          {status().configured ? 'ready' : 'needs setup'}
        </span>
      </div>

      <p class="setup-copy">
        This setup screen is protected by the boot secret printed in the server
        logs. The secret changes on restart unless SETUP_SECRET is set.
      </p>

      <dl class="setup-runtime-grid">
        <div>
          <dt>Version</dt>
          <dd>{status().runtime.version}</dd>
        </div>
        <div>
          <dt>Command prefix</dt>
          <dd>{status().runtime.prefix}</dd>
        </div>
        <div>
          <dt>Bot pubkey</dt>
          <dd>{status().runtime.botPubkey ?? 'not available'}</dd>
        </div>
      </dl>

      <ul class="setup-status-list">
        <For each={setupRows(status())}>{(row) => <StatusRow {...row} />}</For>
      </ul>
    </section>
  );
}

function shortPubkey(pubkey: string): string {
  return `${pubkey.slice(0, 10)}...${pubkey.slice(-8)}`;
}

type SetupTimelineProps = {
  secret: string;
  status: SetupStatus;
  onSaved: () => void;
};

function SetupTimeline(props: SetupTimelineProps): JSX.Element {
  const auth = useNostrAuth();
  const connect = useConnect({ auth });

  const initialRelays = () =>
    props.status.runtime.relays.length > 0
      ? props.status.runtime.relays.join('\n')
      : 'wss://relay.primal.net\nwss://relay.damus.io';

  const [savingMaster, setSavingMaster] = createSignal(false);
  const [generatingBotKey, setGeneratingBotKey] = createSignal(false);
  const [savingRelays, setSavingRelays] = createSignal(false);
  const [relayText, setRelayText] = createSignal(initialRelays());
  const [saveError, setSaveError] = createSignal<string | null>(null);
  const [botKeyError, setBotKeyError] = createSignal<string | null>(null);
  const [relayError, setRelayError] = createSignal<string | null>(null);

  const connectedPubkey = () => {
    const state = auth.authState();

    return state.status === 'connected' ? state.pubkey : null;
  };

  const masterMatches = () => {
    const connected = connectedPubkey();
    const configured = props.status.runtime.masterPubkey;

    return Boolean(
      connected && configured && connected.toLowerCase() === configured,
    );
  };

  async function saveConnectedMaster(): Promise<void> {
    const pubkey = connectedPubkey();

    if (!pubkey) {
      connect.handleConnectMenuClick();

      return;
    }

    setSavingMaster(true);
    setSaveError(null);

    try {
      await setSetupMasterPubkey(props.secret, pubkey);
      props.onSaved();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingMaster(false);
    }
  }

  async function generateBotKey(): Promise<void> {
    setGeneratingBotKey(true);
    setBotKeyError(null);

    try {
      await generateSetupBotKey(props.secret);
      props.onSaved();
    } catch (err) {
      setBotKeyError(err instanceof Error ? err.message : String(err));
    } finally {
      setGeneratingBotKey(false);
    }
  }

  async function saveRelays(): Promise<void> {
    const relays = relayText()
      .split(/[\n,]/)
      .map((relay) => relay.trim())
      .filter(Boolean);

    setSavingRelays(true);
    setRelayError(null);

    try {
      const result = await setSetupRelays(props.secret, relays);

      setRelayText(result.relays.join('\n'));
      props.onSaved();
    } catch (err) {
      setRelayError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingRelays(false);
    }
  }

  return (
    <>
      <section class="card setup-card setup-card--timeline">
        <div class="setup-card-head">
          <div>
            <p class="setup-kicker">Setup Timeline</p>
            <h1>Connect your operator identity</h1>
          </div>
          <span class="setup-badge" classList={{ 'is-ok': masterMatches() }}>
            {masterMatches() ? 'linked' : 'first step'}
          </span>
        </div>

        <ol class="setup-timeline">
          <li
            class="setup-step"
            classList={{ 'is-ok': Boolean(connectedPubkey()) }}
          >
            <span class="setup-step-marker">1</span>
            <div class="setup-step-body">
              <h2>Connect Nostr</h2>
              <p>
                Use your browser signer or existing AppWeaver connect flow. This
                key becomes the master identity the bot responds to.
              </p>
              <div class="setup-step-actions">
                <button
                  type="button"
                  class="web-button"
                  title={connect.manageTitle()}
                  onClick={connect.handleConnectMenuClick}
                >
                  {connect.connectLabel()}
                </button>
                <Show when={connectedPubkey()}>
                  {(pubkey) => (
                    <span class="setup-inline-code">
                      connected {shortPubkey(pubkey())}
                    </span>
                  )}
                </Show>
              </div>
            </div>
          </li>

          <li class="setup-step" classList={{ 'is-ok': masterMatches() }}>
            <span class="setup-step-marker">2</span>
            <div class="setup-step-body">
              <h2>Set master pubkey</h2>
              <p>
                Write the connected Nostr pubkey into{' '}
                <code>BOT_MASTER_PUBKEY</code>
                in <code>.env</code>. Restart after setup to run the full bot
                with the new configuration.
              </p>
              <div class="setup-step-actions">
                <button
                  type="button"
                  class="web-button"
                  disabled={savingMaster()}
                  onClick={() => void saveConnectedMaster()}
                >
                  {savingMaster()
                    ? 'Saving...'
                    : connectedPubkey()
                      ? 'Use connected pubkey'
                      : 'Connect first'}
                </button>
                <Show when={props.status.runtime.masterPubkey}>
                  {(pubkey) => (
                    <span class="setup-inline-code">
                      current {shortPubkey(pubkey())}
                    </span>
                  )}
                </Show>
              </div>
              <Show when={saveError()}>
                {(error) => <p class="setup-error-line">{error()}</p>}
              </Show>
            </div>
          </li>

          <li
            class="setup-step"
            classList={{ 'is-ok': props.status.env.botKey }}
          >
            <span class="setup-step-marker">3</span>
            <div class="setup-step-body">
              <h2>Generate bot key</h2>
              <p>
                Generate a fresh Nostr identity for the bot. This writes{' '}
                <code>BOT_KEY</code> and <code>BOT_PUBKEY</code> to{' '}
                <code>.env</code>.
              </p>
              <div class="setup-step-actions">
                <button
                  type="button"
                  class="web-button"
                  disabled={generatingBotKey()}
                  onClick={() => void generateBotKey()}
                >
                  {generatingBotKey()
                    ? 'Generating...'
                    : props.status.env.botKey
                      ? 'Regenerate bot key'
                      : 'Generate bot key'}
                </button>
                <Show when={props.status.runtime.botPubkey}>
                  {(pubkey) => (
                    <span class="setup-inline-code">
                      bot {shortPubkey(pubkey())}
                    </span>
                  )}
                </Show>
              </div>
              <Show when={props.status.env.botKey}>
                <p class="setup-warning-line">
                  Regenerating replaces the bot identity in <code>.env</code>.
                </p>
              </Show>
              <Show when={botKeyError()}>
                {(error) => <p class="setup-error-line">{error()}</p>}
              </Show>
            </div>
          </li>

          <li
            class="setup-step"
            classList={{ 'is-ok': props.status.env.relays }}
          >
            <span class="setup-step-marker">4</span>
            <div class="setup-step-body">
              <h2>Relay setup</h2>
              <p>
                Add DM/inbox relays for the bot. Bare hostnames are normalized
                to <code>wss://</code> URLs and written to{' '}
                <code>BOT_RELAYS</code>.
              </p>
              <label class="field-block setup-relay-field">
                <span class="field-label">Relays</span>
                <textarea
                  rows="4"
                  value={relayText()}
                  onInput={(event) => setRelayText(event.currentTarget.value)}
                />
                <small>One relay per line, or comma-separated.</small>
              </label>
              <div class="setup-step-actions">
                <button
                  type="button"
                  class="web-button"
                  disabled={savingRelays()}
                  onClick={() => void saveRelays()}
                >
                  {savingRelays() ? 'Saving...' : 'Save relays'}
                </button>
                <Show when={props.status.env.relays}>
                  <span class="setup-inline-code">
                    {props.status.runtime.relayCount} configured
                  </span>
                </Show>
              </div>
              <Show when={relayError()}>
                {(error) => <p class="setup-error-line">{error()}</p>}
              </Show>
            </div>
          </li>
        </ol>
      </section>

      <ConnectOverlays auth={auth} connect={connect} />
    </>
  );
}

function SetupChrome(props: { children: JSX.Element }): JSX.Element {
  const auth = useNostrAuth();
  const connect = useConnect({ auth });

  return (
    <div class="app-shell setup-app-shell">
      <HeaderChrome
        widgets={() => []}
        isWidgetActive={() => false}
        wsConnected={() => false}
        isConnected={connect.isConnected}
        isDisconnected={connect.isDisconnected}
        connectLabel={connect.connectLabel}
        manageTitle={connect.manageTitle}
        pushBusy={() => false}
        piperTtsBusy={() => false}
        piperTtsEnabled={() => false}
        onOpenWidget={() => undefined}
        onConnect={connect.handleConnectMenuClick}
        onLogout={auth.logout}
        onEnablePush={() => undefined}
        onEnablePiperTts={() => undefined}
        onAnyMenuOpenChange={() => undefined}
      />
      {props.children}
      <ConnectOverlays auth={auth} connect={connect} />
    </div>
  );
}

export function SetupView(): JSX.Element {
  const secret = getSetupSecretFromUrl();

  const [status, { refetch }] = createResource(
    () => secret,
    async (value) => fetchSetupStatus(value),
  );

  return (
    <SetupChrome>
      <main class="setup-shell">
        <Switch>
          <Match when={!secret}>
            <section class="card setup-card setup-card--error">
              <p class="setup-kicker">AppWeaver Setup</p>
              <h1>Missing setup secret</h1>
              <p class="setup-copy">
                Open the setup URL printed in the server logs. It includes the
                required secret query parameter.
              </p>
            </section>
          </Match>

          <Match when={status.error}>
            <section class="card setup-card setup-card--error">
              <p class="setup-kicker">AppWeaver Setup</p>
              <h1>Setup access failed</h1>
              <p class="setup-copy">
                The setup secret was rejected or the setup API is unavailable.
                Restart AppWeaver and use the latest setup URL from the logs.
              </p>
              <pre class="setup-error-detail">{String(status.error)}</pre>
            </section>
          </Match>

          <Match when={status.loading}>
            <section class="card setup-card">
              <p class="setup-kicker">AppWeaver Setup</p>
              <h1>Checking configuration...</h1>
              <p class="setup-copy">
                Reading setup status from the local server.
              </p>
            </section>
          </Match>

          <Match when={status()}>
            {(loaded) => (
              <>
                <SetupTimeline
                  secret={secret!}
                  status={loaded()}
                  onSaved={() => void refetch()}
                />
                <SetupStatusCard status={loaded()} />
              </>
            )}
          </Match>
        </Switch>

        <Show when={secret}>
          <p class="setup-footnote">
            Keep this URL private. Anyone with the current boot secret can use
            the setup API until the process restarts.
          </p>
        </Show>
      </main>
    </SetupChrome>
  );
}
