// ---------------------------------------------------------------------------
// src/commands/builtin/adapter.ts — parse prefixed DM input into cmd + args
// ---------------------------------------------------------------------------

type ParseBuiltinInputProps = {
  input: string;
  prefix: string;
};

/**
 * If `input` starts with `prefix`, returns the first command token and remaining args.
 * Otherwise returns null (not a message for this command namespace).
 */
export function parseBuiltinTokens({
  input,
  prefix,
}: ParseBuiltinInputProps): { cmd: string; args: string[] } | null {
  if (!input.startsWith(prefix)) {
    return null;
  }

  const rest = input.slice(prefix.length).trim();
  const parts = rest.split(/\s+/);
  const cmd = (parts[0] ?? '').toLowerCase();
  const args = parts.slice(1);

  return { cmd, args };
}
