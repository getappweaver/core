export type DetectedBrowser =
  | 'Brave'
  | 'Chrome'
  | 'Edge'
  | 'Firefox'
  | 'Safari'
  | 'Samsung Internet'
  | 'Unknown';

export type DetectedDevice = 'phone' | 'tablet' | 'desktop';

export type DetectedOS =
  'Android' | 'iOS' | 'macOS' | 'Windows' | 'Linux' | 'Unknown';

export type BrowserEnvironment = {
  browser: DetectedBrowser;
  device: DetectedDevice;
  os: DetectedOS;
  nip07Available: boolean;
};

export type NostrToolRecommendation = {
  name: string;
  detail: string;
  href: string | null;
};

const CHROMIUM_DESKTOP_BROWSERS: DetectedBrowser[] = [
  'Brave',
  'Chrome',
  'Edge',
];

const hasNavigatorUAData = (
  navigatorValue: Navigator,
): navigatorValue is Navigator & {
  userAgentData: { brands: { brand: string }[] };
} => {
  const userAgentData = (navigatorValue as unknown as Record<string, unknown>)
    .userAgentData;

  return (
    typeof userAgentData === 'object' &&
    userAgentData !== null &&
    Array.isArray((userAgentData as { brands: unknown }).brands)
  );
};

function hasNavigatorBrave(navigatorValue: Navigator): boolean {
  return 'brave' in navigatorValue;
}

function detectBrowser(userAgent: string): DetectedBrowser {
  if (/Edg\//.test(userAgent)) {
    return 'Edge';
  }

  if (/SamsungBrowser\//.test(userAgent)) {
    return 'Samsung Internet';
  }

  if (/Firefox\//.test(userAgent) || /FxiOS\//.test(userAgent)) {
    return 'Firefox';
  }

  if (/CriOS\//.test(userAgent) || /Chrome\//.test(userAgent)) {
    return 'Chrome';
  }

  if (/Safari\//.test(userAgent)) {
    return 'Safari';
  }

  return 'Unknown';
}

function detectOS(userAgent: string, maxTouchPoints: number): DetectedOS {
  if (/Android/i.test(userAgent)) {
    return 'Android';
  }

  if (
    /iPhone|iPad|iPod/i.test(userAgent) ||
    (/Macintosh/i.test(userAgent) && maxTouchPoints > 1)
  ) {
    return 'iOS';
  }

  if (/Mac OS X|Macintosh/i.test(userAgent)) {
    return 'macOS';
  }

  if (/Windows/i.test(userAgent)) {
    return 'Windows';
  }

  if (/Linux/i.test(userAgent)) {
    return 'Linux';
  }

  return 'Unknown';
}

function detectDevice(
  userAgent: string,
  maxTouchPoints: number,
): DetectedDevice {
  if (
    /iPad|Tablet/i.test(userAgent) ||
    (/Macintosh/i.test(userAgent) && maxTouchPoints > 1)
  ) {
    return 'tablet';
  }

  if (/Android/i.test(userAgent) && !/Mobile/i.test(userAgent)) {
    return 'tablet';
  }

  if (/Mobi|iPhone|iPod/i.test(userAgent)) {
    return 'phone';
  }

  return 'desktop';
}

export function detectBrowserEnvironment(): BrowserEnvironment {
  const userAgent = window.navigator.userAgent;
  const maxTouchPoints = window.navigator.maxTouchPoints;

  const brands = hasNavigatorUAData(window.navigator)
    ? window.navigator.userAgentData.brands
    : [];

  const browserFromUA = detectBrowser(userAgent);

  const browser =
    hasNavigatorBrave(window.navigator) ||
    brands.some((brand) => /Brave/i.test(brand.brand))
      ? 'Brave'
      : browserFromUA;

  return {
    browser,
    device: detectDevice(userAgent, maxTouchPoints),
    os: detectOS(userAgent, maxTouchPoints),
    nip07Available: Boolean(window.nostr),
  };
}

export function nostrToolRecommendations(
  environment: BrowserEnvironment,
): NostrToolRecommendation[] {
  const nak = {
    name: 'nak bunker',
    detail:
      'Advanced local option: run nak bunker yourself, then connect AppWeaver with the bunker URL.',
    href: 'https://github.com/fiatjaf/nak',
  };

  if (environment.nip07Available) {
    return [
      {
        name: 'Use detected NIP-07 signer',
        detail:
          'This browser already exposes window.nostr, so the extension connect path should work.',
        href: null,
      },
    ];
  }

  if (environment.os === 'Android') {
    return [
      {
        name: 'Amber',
        detail:
          'Recommended Android signer. Use the Amber tab in Connect Nostr.',
        href: 'https://github.com/greenart7c3/Amber',
      },
    ];
  }

  if (environment.os === 'iOS') {
    return [
      {
        name: 'Clave',
        detail: 'Recommended iOS signer. Use nostrconnect or bunker tabs.',
        href: 'https://clave.casa/',
      },
      nak,
    ];
  }

  if (
    environment.device === 'desktop' &&
    CHROMIUM_DESKTOP_BROWSERS.includes(environment.browser)
  ) {
    return [
      {
        name: 'nos2x extension',
        detail:
          'Recommended desktop NIP-07 signer for Chrome, Brave, and Edge style browsers.',
        href: 'https://chromewebstore.google.com/detail/nos2x/kpgefcfmnafjgpblomihpgmejjdanjjp',
      },
    ];
  }

  if (environment.device === 'desktop' && environment.browser === 'Firefox') {
    return [
      {
        name: 'nos2x-fox extension',
        detail: 'Recommended desktop NIP-07 signer for Firefox.',
        href: 'https://addons.mozilla.org/en-US/firefox/addon/nos2x-fox/',
      },
    ];
  }

  return [nak];
}
