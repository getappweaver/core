import type { JSX } from 'solid-js';

import type { ClientViewRoot } from '@src/web/ui-schema';

import { StoryRuntimeView } from '../story/StoryRuntimeView';
import type { StoryRuntimePayload } from '../story/types';
import type { AiAgentEditorPayload } from '../types';

import { AiAgentEditorView } from './AiAgentEditorView';

type ClientViewHostProps = {
  view: ClientViewRoot;
  onRunJsonCommand: (props: {
    command: string;
    subcommand: string;
    payload: unknown;
  }) => Promise<string>;
};

export function ClientViewHost(props: ClientViewHostProps): JSX.Element {
  if (props.view.view === 'ai-agent-editor') {
    const raw = props.view.payload as AiAgentEditorPayload;

    const payload: AiAgentEditorPayload = {
      ...raw,
      modelCatalog: raw.modelCatalog,
    };

    return (
      <AiAgentEditorView
        payload={payload}
        onSave={(payload) =>
          props.onRunJsonCommand({
            command: 'ai',
            subcommand: 'agents upsert-json',
            payload,
          })
        }
      />
    );
  }

  if (props.view.view === 'story-runtime') {
    return (
      <StoryRuntimeView payload={props.view.payload as StoryRuntimePayload} />
    );
  }

  return (
    <div class="client-view-host">
      <div class="client-view-host__header">
        Custom view: <code>{props.view.view}</code>
      </div>
      <pre class="client-view-host__payload">
        {JSON.stringify(props.view.payload, null, 2)}
      </pre>
    </div>
  );
}
