export type LinkPreview = {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
};

const LINK_PREVIEW_TIMEOUT_MS = 6_000;
const LINK_PREVIEW_MAX_HTML_CHARS = 2_000_000;

const OEMBED_ENDPOINTS: Record<string, string> = {
  'flic.kr': 'https://www.flickr.com/services/oembed/?format=json&url=',
  'flickr.com': 'https://www.flickr.com/services/oembed/?format=json&url=',
  'm.youtube.com': 'https://www.youtube.com/oembed?url=',
  'open.spotify.com': 'https://open.spotify.com/oembed?url=',
  'player.vimeo.com': 'https://vimeo.com/api/oembed.json?url=',
  'soundcloud.com': 'https://soundcloud.com/oembed?format=json&url=',
  'tiktok.com': 'https://www.tiktok.com/oembed?url=',
  'twitter.com': 'https://publish.x.com/oembed?url=',
  'vimeo.com': 'https://vimeo.com/api/oembed.json?url=',
  'vm.tiktok.com': 'https://www.tiktok.com/oembed?url=',
  'www.flickr.com': 'https://www.flickr.com/services/oembed/?format=json&url=',
  'www.soundcloud.com': 'https://soundcloud.com/oembed?format=json&url=',
  'www.tiktok.com': 'https://www.tiktok.com/oembed?url=',
  'www.twitter.com': 'https://publish.x.com/oembed?url=',
  'www.vimeo.com': 'https://vimeo.com/api/oembed.json?url=',
  'www.x.com': 'https://publish.x.com/oembed?url=',
  'www.youtube.com': 'https://www.youtube.com/oembed?url=',
  'x.com': 'https://publish.x.com/oembed?url=',
  'youtu.be': 'https://www.youtube.com/oembed?url=',
  'youtube.com': 'https://www.youtube.com/oembed?url=',
};

type ExtractMetaProps = {
  html: string;
  url: string;
};

type OembedResponse = {
  title?: unknown;
  provider_name?: unknown;
  thumbnail_url?: unknown;
  iframe_url?: unknown;
};

type SpotifyEmbedEntity = {
  type: string | null;
  title: string | null;
  name: string | null;
  artists: string[];
};

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

function attr(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`${name}=["']([^"']+)["']`, 'i'));

  return match ? decodeHtml(match[1] ?? '') : null;
}

function absolutizeUrl(value: string | null, baseUrl: string): string | null {
  if (!value) {
    return null;
  }

  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return null;
  }
}

function metaByProperty(html: string, property: string): string | null {
  const metaTags = html.match(/<meta\s+[^>]*>/gi) ?? [];

  for (const tag of metaTags) {
    const prop = attr(tag, 'property') ?? attr(tag, 'name');

    if (prop?.toLowerCase() === property.toLowerCase()) {
      return attr(tag, 'content');
    }
  }

  return null;
}

function titleTag(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);

  return match ? decodeHtml(match[1] ?? '') : null;
}

function stringField(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

function titleCase(value: string | null): string | null {
  return value ? `${value.slice(0, 1).toUpperCase()}${value.slice(1)}` : null;
}

function recordField(value: unknown, key: string): unknown {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)[key]
    : null;
}

function parseSpotifyEmbedEntity(html: string): SpotifyEmbedEntity | null {
  const match = html.match(
    /<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i,
  );

  if (!match) {
    return null;
  }

  try {
    const root = JSON.parse(decodeHtml(match[1] ?? '')) as unknown;

    const entity = recordField(
      recordField(
        recordField(
          recordField(recordField(root, 'props'), 'pageProps'),
          'state',
        ),
        'data',
      ),
      'entity',
    );

    const artistsRaw = recordField(entity, 'artists');

    const artists = Array.isArray(artistsRaw)
      ? artistsRaw
          .map((artist) => stringField(recordField(artist, 'name')))
          .filter((artist): artist is string => artist !== null)
      : [];

    return {
      type: stringField(recordField(entity, 'type')),
      title: stringField(recordField(entity, 'title')),
      name: stringField(recordField(entity, 'name')),
      artists,
    };
  } catch {
    return null;
  }
}

async function fetchSpotifyDescription(
  iframeUrl: string | null,
): Promise<string | null> {
  if (!iframeUrl) {
    return null;
  }

  try {
    const response = await fetch(iframeUrl, {
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 AppWeaver/1.0',
      },
    });

    if (!response.ok) {
      return null;
    }

    const entity = parseSpotifyEmbedEntity(await response.text());

    if (!entity) {
      return null;
    }

    return [
      entity.artists.join(', '),
      entity.title ?? entity.name,
      titleCase(entity.type),
    ]
      .filter((part): part is string => Boolean(part))
      .join(' · ');
  } catch {
    return null;
  }
}

async function fetchOembedPreview({
  url,
  fallback,
}: {
  url: URL;
  fallback: LinkPreview;
}): Promise<LinkPreview | null> {
  const endpoint = OEMBED_ENDPOINTS[url.hostname.toLowerCase()];

  if (!endpoint) {
    return null;
  }

  try {
    const response = await fetch(
      `${endpoint}${encodeURIComponent(url.toString())}`,
      {
        headers: {
          Accept: 'application/json',
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 AppWeaver/1.0',
        },
      },
    );

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as OembedResponse;

    const iframeUrl = stringField(data.iframe_url);

    return {
      ...fallback,
      title: stringField(data.title) ?? fallback.title,
      description: await fetchSpotifyDescription(iframeUrl),
      siteName: stringField(data.provider_name) ?? fallback.siteName,
      image: absolutizeUrl(stringField(data.thumbnail_url), url.toString()),
    };
  } catch {
    return null;
  }
}

export function extractLinkPreview({
  html,
  url,
}: ExtractMetaProps): LinkPreview {
  const title = metaByProperty(html, 'og:title') ?? titleTag(html);

  const description =
    metaByProperty(html, 'og:description') ??
    metaByProperty(html, 'description');

  const image = absolutizeUrl(metaByProperty(html, 'og:image'), url);
  const siteName = metaByProperty(html, 'og:site_name');

  return {
    url,
    title,
    description,
    image,
    siteName,
  };
}

export async function fetchLinkPreview(url: string): Promise<LinkPreview> {
  const parsed = new URL(url);

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('unsupported_url_protocol');
  }

  const fallback: LinkPreview = {
    url: parsed.toString(),
    title: parsed.hostname,
    description: null,
    image: null,
    siteName: parsed.hostname,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LINK_PREVIEW_TIMEOUT_MS);

  try {
    const oembedPreview = await fetchOembedPreview({
      url: parsed,
      fallback,
    });

    if (oembedPreview) {
      return oembedPreview;
    }

    const response = await fetch(parsed.toString(), {
      headers: {
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 AppWeaver/1.0',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      return fallback;
    }

    const contentType = response.headers.get('content-type') ?? '';

    if (contentType && !contentType.toLowerCase().includes('html')) {
      return fallback;
    }

    const html = await response.text();

    const preview = extractLinkPreview({
      html: html.slice(0, LINK_PREVIEW_MAX_HTML_CHARS),
      url: parsed.toString(),
    });

    return {
      ...preview,
      title: preview.title ?? fallback.title,
      siteName: preview.siteName ?? fallback.siteName,
    };
  } catch {
    return (await fetchOembedPreview({ url: parsed, fallback })) ?? fallback;
  } finally {
    clearTimeout(timeout);
  }
}
