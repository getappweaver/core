import type { JSX } from 'solid-js';
import { createEffect, createSignal, Show } from 'solid-js';

import { ConnectOverlays } from '../../connect/ConnectOverlays';
import { useConnect } from '../../connect/useConnect';
import { useNostrAuth } from '../../contexts/NostrAuthContext';

import {
  generateSetupBotKey,
  setSetupDefaults,
  setSetupMasterPubkey,
  setSetupRelays,
  type ParentWorkspaceInstallResult,
  type SetupDefaults,
  type SetupStatus,
} from '../transport';

type SetupTimelineCardProps = {
  token: string;
  status: SetupStatus;
  onSaved: () => void;
};

function shortPubkey(pubkey: string): string {
  return `${pubkey.slice(0, 10)}...${pubkey.slice(-8)}`;
}

export function SetupTimelineCard(props: SetupTimelineCardProps): JSX.Element {
  const auth = useNostrAuth();
  const connect = useConnect({ auth });

  const initialRelays = () =>
    props.status.runtime.relays.length > 0
      ? props.status.runtime.relays.join('\n')
      : 'wss://relay.primal.net\nwss://relay.damus.io';

  const [savingMaster, setSavingMaster] = createSignal(false);
  const [generatingBotKey, setGeneratingBotKey] = createSignal(false);
  const [savingRelays, setSavingRelays] = createSignal(false);
  const [savingDefaults, setSavingDefaults] = createSignal(false);
  const [relayText, setRelayText] = createSignal(initialRelays());
  const [prefix, setPrefix] = createSignal(props.status.runtime.prefix);
  const [backend, setBackend] = createSignal(props.status.defaults.backend);
  const [provider, setProvider] = createSignal(props.status.defaults.provider);
  const [mode, setMode] = createSignal(props.status.defaults.mode);

  const [workspace, setWorkspace] = createSignal(
    props.status.defaults.workspace,
  );

  const [linting, setLinting] = createSignal(props.status.defaults.linting);

  const [readyNotification, setReadyNotification] = createSignal(
    props.status.defaults.readyNotification,
  );

  const [saveError, setSaveError] = createSignal<string | null>(null);
  const [botKeyError, setBotKeyError] = createSignal<string | null>(null);
  const [relayError, setRelayError] = createSignal<string | null>(null);
  const [defaultsError, setDefaultsError] = createSignal<string | null>(null);

  const [defaultsInstallResult, setDefaultsInstallResult] =
    createSignal<ParentWorkspaceInstallResult | null>(null);

  createEffect(() => {
    setPrefix(props.status.runtime.prefix);
    setBackend(props.status.defaults.backend);
    setProvider(props.status.defaults.provider);
    setMode(props.status.defaults.mode);
    setWorkspace(props.status.defaults.workspace);
    setLinting(props.status.defaults.linting);
    setReadyNotification(props.status.defaults.readyNotification);
  });

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
      await setSetupMasterPubkey(props.token, pubkey);
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
      await generateSetupBotKey(props.token);
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
      const result = await setSetupRelays(props.token, relays);

      setRelayText(result.relays.join('\n'));
      props.onSaved();
    } catch (err) {
      setRelayError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingRelays(false);
    }
  }

  async function saveDefaults(): Promise<void> {
    const defaults: SetupDefaults = {
      prefix: prefix(),
      backend: backend(),
      provider: provider(),
      mode: mode(),
      workspace: workspace(),
      linting: linting(),
      readyNotification: readyNotification(),
    };

    setSavingDefaults(true);
    setDefaultsError(null);
    setDefaultsInstallResult(null);

    try {
      const result = await setSetupDefaults(props.token, defaults);

      setDefaultsInstallResult(result.parentWorkspaceInstall);
      props.onSaved();
    } catch (err) {
      setDefaultsError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingDefaults(false);
    }
  }

  return (
    <>
      <section class="card setup-card setup-card--timeline">
        <div class="setup-card-head">
          <div>
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

          <li class="setup-step is-ok">
            <span class="setup-step-marker">5</span>
            <div class="setup-step-body">
              <h2>Bot defaults</h2>
              <p>
                Set the defaults that <code>bun run bot:setup</code> also
                manages. These are stored in the core database, except the ready
                notification flag in <code>.env</code>.
              </p>
              <div class="setup-defaults-grid">
                <label class="field-block">
                  <span class="field-label">DM command prefix</span>
                  <input
                    type="text"
                    value={prefix()}
                    onInput={(event) => setPrefix(event.currentTarget.value)}
                  />
                  <small>Examples: /help or .help</small>
                </label>
                <label class="field-block">
                  <span class="field-label">Workspace</span>
                  <select
                    value={workspace()}
                    onChange={(event) =>
                      setWorkspace(event.currentTarget.value)
                    }
                  >
                    <option value="parent">parent</option>
                    <option value="appweaver">appweaver</option>
                  </select>
                  <small>
                    Use parent for your project checkout, or appweaver when the
                    agent should work only inside this AppWeaver repo.
                  </small>
                </label>
                <label class="field-block">
                  <span class="field-label">Backend</span>
                  <select
                    value={backend()}
                    onChange={(event) => setBackend(event.currentTarget.value)}
                  >
                    <option value="opencode">opencode</option>
                    <option value="cursor">cursor</option>
                  </select>
                  <small>
                    OpenCode is the recommended default. Cursor is available if
                    you already use Cursor cloud agents.
                  </small>
                </label>
                <label class="field-block">
                  <span class="field-label">Provider</span>
                  <select
                    value={provider()}
                    onChange={(event) => setProvider(event.currentTarget.value)}
                  >
                    <option value="local">local</option>
                    <option value="routstr">routstr</option>
                  </select>
                  <small>
                    Local uses your selected backend/provider config. Routstr
                    routes paid requests through the Cashu-backed provider flow.
                  </small>
                </label>
                <label class="field-block">
                  <span class="field-label">Mode</span>
                  <select
                    value={mode()}
                    onChange={(event) => setMode(event.currentTarget.value)}
                  >
                    <option value="ask">ask</option>
                    <option value="plan">plan</option>
                    <option value="agent">agent</option>
                  </select>
                  <small>
                    Ask answers questions, plan proposes changes, and agent can
                    edit files in the selected workspace.
                  </small>
                </label>
                <label class="field-block">
                  <span class="field-label">Lint auto</span>
                  <select
                    value={linting()}
                    onChange={(event) => setLinting(event.currentTarget.value)}
                  >
                    <option value="off">off</option>
                    <option value="on">on</option>
                  </select>
                  <small>
                    Use this if your selected workspace can run{' '}
                    <code>bun run lint</code>. In agent mode, AppWeaver will run
                    lint after edits and do one automatic fix pass if it fails.
                  </small>
                </label>
                <label class="field-block setup-checkbox-field">
                  <span class="field-label">Ready notification</span>
                  <span class="setup-checkbox-row">
                    <input
                      type="checkbox"
                      class="checkbox-retro"
                      checked={readyNotification()}
                      onChange={(event) =>
                        setReadyNotification(event.currentTarget.checked)
                      }
                    />
                    Send a DM when AppWeaver starts
                  </span>
                  <small>
                    Useful on a server so you know the bot is online after
                    restart or deployment.
                  </small>
                </label>
              </div>
              <div class="setup-step-actions">
                <button
                  type="button"
                  class="web-button"
                  disabled={savingDefaults()}
                  onClick={() => void saveDefaults()}
                >
                  {savingDefaults() ? 'Saving...' : 'Save defaults'}
                </button>
                <span class="setup-inline-code">
                  {backend()} / {provider()} / {mode()}
                </span>
              </div>
              <Show when={workspace() === 'parent'}>
                <p class="setup-warning-line">
                  Saving defaults with OpenCode + parent workspace also installs
                  missing OpenCode symlinks and agent templates automatically.
                </p>
              </Show>
              <Show when={defaultsInstallResult()}>
                {(installed) => (
                  <p class="setup-inline-code">
                    Parent assets checked:{' '}
                    {installed().symlinks.installed.length} symlink(s)
                    installed, {installed().symlinks.conflicts.length}{' '}
                    conflict(s)
                  </p>
                )}
              </Show>
              <Show when={defaultsError()}>
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
