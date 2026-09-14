import { decodeToken } from '@src/wallet/cashu';

import type { WalletDecodeRepresentation } from './representation';

type HandleWalletDecodeProps = {
  token: string | undefined;
  prefix: string;
};

function toRepresentation(
  data: WalletDecodeRepresentation['data'],
): WalletDecodeRepresentation {
  return {
    kind: 'cashu.decode',
    version: 1,
    meta: { command: 'cashu', subcommand: 'decode' },
    data,
  };
}

export function handleWalletDecode(
  props: HandleWalletDecodeProps,
): WalletDecodeRepresentation {
  const { token, prefix } = props;

  if (!token) {
    return toRepresentation({ view: 'usage', prefix });
  }

  const text = decodeToken(token);

  return toRepresentation({ view: 'result', text });
}
