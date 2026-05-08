import { APPWEAVER_RELAY } from '@src/appweaver-relay';
import type { CommandDefinition } from '@src/system/command-definition';

export function getRoadmapCommandDefinition({
  prefix,
}: {
  prefix: string;
}): CommandDefinition {
  return {
    name: 'roadmap',
    summary: 'View AppWeaver roadmap issues, funding, and board assignments.',
    aliases: [],
    subcommands: [
      {
        name: 'list',
        summary: 'Read roadmap issues from the AppWeaver roadmap relay.',
        aliases: [],
        arguments: [],
        options: [
          {
            name: 'relay',
            summary: 'Relay URL to read from.',
            flag: '--relay',
            shortFlag: null,
            kind: 'string',
            required: false,
            webDefaultValue: APPWEAVER_RELAY,
          },
        ],
        examples: [
          `${prefix}roadmap list`,
          `${prefix}roadmap list --relay ${APPWEAVER_RELAY}`,
        ],
        webWidget: {
          placement: 'header',
          surface: 'timeline_singleton',
          label: 'Roadmap',
          modalTitle: 'Roadmap',
          icon: '/src/commands/roadmap/renderers/roadmap.svg',
          order: 20,
        },
      },
      {
        name: 'new',
        summary: 'Create a new roadmap issue from the web client.',
        aliases: ['add'],
        arguments: [
          {
            name: 'repo',
            summary:
              'NIP-34 repository address, e.g. 30617:<owner-pubkey>:<repo-id>.',
            kind: 'string',
            required: true,
            variadic: false,
          },
          {
            name: 'type',
            summary: 'Issue type.',
            kind: 'string',
            required: true,
            variadic: false,
            choices: ['feature', 'bug'],
            webDefaultValue: 'feature',
          },
          {
            name: 'title',
            summary: 'Short issue title.',
            kind: 'string',
            required: true,
            variadic: false,
          },
          {
            name: 'description',
            summary: 'Issue description.',
            kind: 'string',
            required: true,
            variadic: true,
          },
        ],
        options: [
          {
            name: 'relay',
            summary: 'Relay URL to publish to.',
            flag: '--relay',
            shortFlag: null,
            kind: 'string',
            required: false,
            webDefaultValue: APPWEAVER_RELAY,
          },
        ],
        examples: [
          `${prefix}roadmap new 30617:<owner-pubkey>:appweaver feature "Export as static site"`,
        ],
        webExecutionMode: 'requires_input',
      },
      {
        name: 'fund',
        summary: 'Open the funding dialog for a roadmap issue.',
        aliases: ['zap'],
        arguments: [
          {
            name: 'issueId',
            summary: 'Issue event id.',
            kind: 'string',
            required: true,
            variadic: false,
          },
        ],
        options: [
          {
            name: 'title',
            summary: 'Issue title.',
            flag: '--title',
            shortFlag: null,
            kind: 'string',
            required: false,
          },
          {
            name: 'sats',
            summary: 'Current verified sats.',
            flag: '--sats',
            shortFlag: null,
            kind: 'integer',
            required: false,
          },
          {
            name: 'relay',
            summary: 'Relay URL to use for verification.',
            flag: '--relay',
            shortFlag: null,
            kind: 'string',
            required: false,
            webDefaultValue: APPWEAVER_RELAY,
          },
        ],
        examples: [
          `${prefix}roadmap fund <issue-id> --title "Issue title" --sats 1000`,
        ],
        webExecutionMode: 'runnable_customizable',
      },
      {
        name: 'board',
        summary: 'Open one roadmap board by workflow id.',
        aliases: [],
        arguments: [
          {
            name: 'id',
            summary: 'Workflow event id or d tag.',
            kind: 'string',
            required: true,
            variadic: false,
          },
        ],
        options: [
          {
            name: 'relay',
            summary: 'Relay URL to read from.',
            flag: '--relay',
            shortFlag: null,
            kind: 'string',
            required: false,
            webDefaultValue: APPWEAVER_RELAY,
          },
        ],
        examples: [`${prefix}roadmap board appweaver-roadmap`],
        webExecutionMode: 'runnable_customizable',
      },
    ],
  };
}
