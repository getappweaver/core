// ---------------------------------------------------------------------------
// web/src/nostr/connect-qr.ts — SVG QR for Nostr Connect URIs (qrcode package)
// ---------------------------------------------------------------------------

import QRCode from 'qrcode';

type NostrConnectUriToQrSvgProps = {
  uri: string;
};

/**
 * Renders a dark-on-light SVG suitable for scanning (high contrast).
 */
export async function nostrConnectUriToQrSvg(
  props: NostrConnectUriToQrSvgProps,
): Promise<string> {
  const { uri } = props;

  return QRCode.toString(uri, {
    type: 'svg',
    width: 200,
    margin: 2,
    color: {
      dark: '#000000',
      light: '#ffffff',
    },
  });
}
