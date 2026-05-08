export function normalizeMintUrl(mintUrl: string): string {
  const url = new URL(mintUrl);

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Unsupported mint URL protocol: ${url.protocol}`);
  }

  url.protocol = url.protocol.toLowerCase();
  url.hostname = url.hostname.toLowerCase();
  url.username = '';
  url.password = '';
  url.search = '';
  url.hash = '';

  if (
    (url.protocol === 'http:' && url.port === '80') ||
    (url.protocol === 'https:' && url.port === '443')
  ) {
    url.port = '';
  }

  if (!url.pathname || url.pathname === '/') {
    url.pathname = '/';
  } else {
    url.pathname = url.pathname.replace(/\/+$/, '');
  }

  return url.toString();
}

export function createMintCounterKey(props: {
  mintUrl: string;
  keysetId: string;
}): string {
  return `${normalizeMintUrl(props.mintUrl)}|keyset=${props.keysetId}`;
}

export function parseMintCounterKey(key: string): {
  mintUrl: string;
  keysetId: string;
} | null {
  const separator = '|keyset=';
  const separatorIndex = key.indexOf(separator);

  if (separatorIndex === -1) {
    return null;
  }

  const mintUrl = key.slice(0, separatorIndex);
  const keysetId = key.slice(separatorIndex + separator.length);

  if (!mintUrl || !keysetId) {
    return null;
  }

  return { mintUrl, keysetId };
}
