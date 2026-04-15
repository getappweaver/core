import { nip19 } from 'nostr-tools';

export function formatBunkerPubkey(hex: string): string {
  try {
    return nip19.npubEncode(hex);
  } catch {
    return hex;
  }
}

export function formatBunkerCreatedAt(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}
