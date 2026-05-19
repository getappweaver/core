import { For, Show, createSignal } from 'solid-js';
import { createStore } from 'solid-js/store';

import type { AiAgentEditorPayload, PermissionAction } from '../types';

import { OpenCodeModelField } from './OpenCodeModelField';
import { WebButton } from './WebButton';

const TOOLS = [
  'read',
  'edit',
  'glob',
  'grep',
  'list',
  'bash',
  'task',
  'external_directory',
  'todowrite',
  'question',
  'webfetch',
  'websearch',
  'codesearch',
  'lsp',
  'doom_loop',
  'skill',
] as const;

type AiAgentEditorViewProps = {
  payload: AiAgentEditorPayload;
  onSave: (payload: AiAgentEditorPayload) => Promise<string>;
};

export function AiAgentEditorView(props: AiAgentEditorViewProps) {
  const [values, setValues] = createStore(
    structuredClone(props.payload.values),
  );

  const [saving, setSaving] = createSignal(false);
  const [status, setStatus] = createSignal<string | null>(null);
  const [error, setError] = createSignal<string | null>(null);

  async function handleSave(): Promise<void> {
    setSaving(true);
    setStatus(null);
    setError(null);

    try {
      const message = await props.onSave({
        ...props.payload,
        values,
      });

      setStatus(message);

      window.dispatchEvent(
        new CustomEvent('composer-ai-state-refresh-requested'),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div class="ai-agent-editor-view">
      <div class="ai-agent-editor-view__header">
        <strong>
          {props.payload.mode === 'edit'
            ? `Edit Agent: ${props.payload.originalName ?? ''}`
            : 'New Agent'}
        </strong>
      </div>

      <Show when={status()}>
        <div class="status-modal-loading">{status()}</div>
      </Show>
      <Show when={error()}>
        <div class="status-modal-error">{error()}</div>
      </Show>

      <div class="ai-agent-editor-view__grid">
        <label class="field-block">
          <span class="field-label">Name</span>
          <input
            type="text"
            value={values.name}
            onInput={(e) => setValues('name', e.currentTarget.value)}
          />
        </label>

        <label class="field-block">
          <span class="field-label">Description</span>
          <textarea
            name="description"
            rows={3}
            value={values.description}
            onInput={(e) => setValues('description', e.currentTarget.value)}
          />
        </label>

        <label class="field-block">
          <span class="field-label">Model</span>
          <OpenCodeModelField
            fieldId={`ai-agent-model-${props.payload.mode}-${props.payload.originalName ?? 'new'}`}
            value={values.model}
            choices={props.payload.modelCatalog}
            onChange={(v) => setValues('model', v)}
          />
        </label>

        <div class="field-row">
          <label class="field-block">
            <span class="field-label">Mode</span>
            <select
              value={values.mode}
              onChange={(e) => setValues('mode', e.currentTarget.value)}
            >
              <option value="primary">primary</option>
              <option value="subagent">subagent</option>
              <option value="all">all</option>
            </select>
          </label>

          <label class="field-block">
            <span class="field-label">Color</span>
            <select
              value={values.color}
              onChange={(e) => setValues('color', e.currentTarget.value)}
            >
              <option value="">(none)</option>
              <option value="info">info</option>
              <option value="warning">warning</option>
              <option value="danger">danger</option>
              <option value="success">success</option>
            </select>
          </label>

          <label class="field-block">
            <span class="field-label">Steps</span>
            <input
              type="number"
              value={values.steps}
              onInput={(e) => setValues('steps', e.currentTarget.value)}
            />
          </label>
        </div>

        <label class="field-block">
          <span class="field-label">System prompt</span>
          <textarea
            name="systemPrompt"
            rows={8}
            value={values.systemPrompt}
            onInput={(e) => setValues('systemPrompt', e.currentTarget.value)}
          />
        </label>

        <label class="field-block">
          <div class="field-flag-line">
            <span class="field-label">Hidden</span>
            <input
              type="checkbox"
              checked={values.hidden}
              onChange={(e) => setValues('hidden', e.currentTarget.checked)}
            />
          </div>
        </label>

        <label class="field-block">
          <div class="field-flag-line">
            <span class="field-label">Disabled</span>
            <input
              type="checkbox"
              checked={values.disabled}
              onChange={(e) => setValues('disabled', e.currentTarget.checked)}
            />
          </div>
        </label>

        <div class="field-block">
          <span class="field-label">Permissions</span>
          <div class="ai-agent-editor-view__permissions">
            <For each={TOOLS as readonly string[]}>
              {(tool) => (
                <label class="ai-agent-editor-view__perm-row">
                  <span
                    classList={{
                      'ai-agent-editor-view__perm-label--changed':
                        values.permissions[tool] === 'ask' ||
                        values.permissions[tool] === 'deny',
                    }}
                  >
                    {tool}
                  </span>
                  <select
                    value={values.permissions[tool] ?? ''}
                    onChange={(e) =>
                      setValues(
                        'permissions',
                        tool,
                        e.currentTarget.value as '' | PermissionAction,
                      )
                    }
                  >
                    <option value="">default</option>
                    <option value="allow">allow</option>
                    <option value="ask">ask</option>
                    <option value="deny">deny</option>
                  </select>
                </label>
              )}
            </For>
          </div>
        </div>

        <div class="actions-row actions-row--form-run ai-agent-editor-view__actions">
          <WebButton
            type="button"
            class="form-run-btn web-button"
            disabled={saving()}
            onClick={() => void handleSave()}
          >
            {saving() ? 'Saving…' : 'Save'}
          </WebButton>
        </div>
      </div>
    </div>
  );
}
