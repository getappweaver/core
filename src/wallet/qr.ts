import QRCode from 'qrcode';

export async function invoiceToQrDataUri(invoice: string): Promise<string> {
  const svg = await QRCode.toString(invoice, {
    type: 'svg',
    width: 200,
    margin: 2,
    color: {
      dark: '#000000',
      light: '#ffffff',
    },
  });

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}
