import type { WebAction, WebNode, WebNodeRoot, WebTone } from './ui-schema';

export type MultiChoiceOption = {
  label: string;
  value: string;
  tone?: WebTone;
};

export function textNode(value: string): WebNode {
  return {
    type: 'text',
    value,
  };
}

export function textBlock(value: string, tone?: WebTone): WebNode {
  return {
    type: 'element',
    tag: 'text',
    props: {
      whiteSpace: 'pre-wrap',
      ...(tone ? { tone } : {}),
    },
    children: [textNode(value)],
  };
}

export function stack(
  children: WebNode[],
  gap: 'xs' | 'sm' | 'md' | 'lg' = 'md',
): WebNode {
  return {
    type: 'element',
    tag: 'stack',
    props: {
      gap,
    },
    children,
  };
}

export function row(
  children: WebNode[],
  gap: 'xs' | 'sm' | 'md' | 'lg' = 'sm',
): WebNode {
  return {
    type: 'element',
    tag: 'row',
    props: {
      gap,
    },
    children,
  };
}

export function promptAnswerAction(value: string): WebAction {
  return {
    type: 'prompt_answer',
    value,
  };
}

export function multiChoiceQuestion(params: {
  command: string;
  subcommand: string;
  question: string | WebNode;
  options: MultiChoiceOption[];
}): WebNodeRoot {
  const questionNode =
    typeof params.question === 'string'
      ? textBlock(params.question)
      : params.question;

  return {
    kind: 'ui',
    version: 1,
    meta: {
      command: params.command,
      subcommand: params.subcommand,
    },
    tree: stack([
      questionNode,
      row(
        params.options.map((option) => ({
          type: 'element' as const,
          tag: 'button' as const,
          props: {
            label: option.label,
            ...(option.tone ? { tone: option.tone } : {}),
            action: promptAnswerAction(option.value),
          },
        })),
      ),
    ]),
  };
}

export function draftReviewPrompt(params: {
  command: string;
  subcommand: string;
  body: string | WebNode;
}): WebNodeRoot {
  const normalizedBody =
    typeof params.body === 'string'
      ? params.body
          .replace(/\n\na=accept, r=revise, d=decline, s=skip, q=quit\s*$/i, '')
          .trimEnd()
      : params.body;

  const bodyNode =
    typeof normalizedBody === 'string'
      ? textBlock(normalizedBody)
      : normalizedBody;

  return {
    kind: 'ui',
    version: 1,
    meta: {
      command: params.command,
      subcommand: params.subcommand,
    },
    tree: stack([
      bodyNode,
      row([
        {
          type: 'element',
          tag: 'button',
          props: {
            label: 'Accept',
            action: promptAnswerAction('a'),
          },
        },
        {
          type: 'element',
          tag: 'button',
          props: {
            label: 'Revise',
            tone: 'warning',
            action: promptAnswerAction('r'),
          },
        },
        {
          type: 'element',
          tag: 'button',
          props: {
            label: 'Decline',
            tone: 'danger',
            action: promptAnswerAction('d'),
          },
        },
        {
          type: 'element',
          tag: 'button',
          props: {
            label: 'Skip',
            tone: 'muted',
            action: promptAnswerAction('s'),
          },
        },
        {
          type: 'element',
          tag: 'button',
          props: {
            label: 'Quit',
            tone: 'muted',
            action: promptAnswerAction('q'),
          },
        },
      ]),
    ]),
  };
}
