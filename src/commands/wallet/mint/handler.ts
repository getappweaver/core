import type { CoreDb } from '@src/db';
import { getWalletDefaultMintUrl, setWalletDefaultMintUrl } from '@src/db';

import type { WalletMintRepresentation } from './representation';

type HandleWalletMintProps = {
  seenDb: CoreDb;
  defaultMintUrl: string | null;
  url: string | null | undefined;
  prefix: string;
};

function toRepresentation(
  data: WalletMintRepresentation['data'],
): WalletMintRepresentation {
  return {
    kind: 'wallet.mint',
    version: 1,
    meta: { command: 'wallet', subcommand: 'mint' },
    data,
  };
}

export function handleWalletMint(
  props: HandleWalletMintProps,
): WalletMintRepresentation {
  const { seenDb, defaultMintUrl, url, prefix } = props;

  if (!url) {
    const current = getWalletDefaultMintUrl(seenDb, defaultMintUrl);

    if (current) {
      return toRepresentation({ view: 'current', mintUrl: current });
    }

    return toRepresentation({ view: 'hint-no-mint', prefix });
  }

  setWalletDefaultMintUrl(seenDb, url);

  return toRepresentation({ view: 'set', mintUrl: url });
}
