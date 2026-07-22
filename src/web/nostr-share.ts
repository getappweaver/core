import type { WebAction } from './ui-schema';

export type NostrShareType = 'nevent' | 'nprofile';

export type NostrSharePrefixes = {
  nevent: string;
  nprofile: string;
};

type NostrShareUrlProps = {
  type: NostrShareType;
  identifier: string;
  prefixes: NostrSharePrefixes;
};

export function nostrShareUrl({
  type,
  identifier,
  prefixes,
}: NostrShareUrlProps): string {
  const placeholder = `[${type}]`;
  const prefix = prefixes[type].trim() || 'nostr://';

  return prefix.includes(placeholder)
    ? prefix.replaceAll(placeholder, identifier)
    : `${prefix}${identifier}`;
}

type OpenNostrShareActionProps = NostrShareUrlProps;

export function openNostrShareAction({
  type,
  identifier,
  prefixes,
}: OpenNostrShareActionProps): WebAction {
  return {
    type: 'clientAction',
    action: 'web.openUrl',
    payload: { url: nostrShareUrl({ type, identifier, prefixes }) },
  };
}
