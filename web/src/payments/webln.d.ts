interface Window {
  webln?: {
    enable(): Promise<void>;
    getInfo(): Promise<{
      node?: { alias?: string; pubkey?: string };
      methods?: string[];
    }>;
    getBalance?(): Promise<{
      balance: number;
      currency?: 'sats' | 'EUR' | 'USD' | string;
    }>;
    isEnabled?(): Promise<boolean>;
    sendPayment(invoice: string): Promise<unknown>;
  };
}
