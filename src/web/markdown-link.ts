import {
  resourceAddressToHash,
  ResourceViewV1,
} from '@src/capabilities/resource-view.v1';

import { isClosingFence, parseFenceMarker } from './markdown-table';

export const WORKSPACE_FILE_RESOURCE_VIEW_PROVIDER_ID =
  'appweaver-file-plugin/resource-view/v1';

export type MarkdownInlineTextSegment = {
  type: 'text';
  text: string;
};

export type MarkdownInlineLinkSegment = {
  type: 'link';
  label: string;
  destination: string;
  raw: string;
  pathBase: 'workspace' | 'current';
};

export type MarkdownInlineSegment =
  MarkdownInlineTextSegment | MarkdownInlineLinkSegment;

export type MarkdownHeadingIndexEntry = {
  lineNumber: number;
  slug: string;
  title: string;
};

export type MarkdownResolvedLink = {
  href: string;
  external: boolean;
};

type ParseMarkdownInlineProps = {
  text: string;
  fileMentions: boolean;
};

type ResolveMarkdownLinkProps = {
  destination: string;
  currentPath: string | null;
  pathBase: 'workspace' | 'current';
  fileResourceProviderId: string;
  localHeadingHrefPrefix: string | null;
};

type WorkspaceFileResourceHrefProps = {
  providerId: string;
  path: string;
  line: number | null;
  heading: string | null;
};

type ResolveWorkspaceRelativePathProps = {
  currentPath: string | null;
  destinationPath: string;
};

type MarkdownFenceTracker = {
  consume: (line: string) => boolean;
};

const TRAILING_URL_PUNCTUATION = new Set(['.', ',', ';', ':', '!', '?', ')']);

export function createMarkdownFenceTracker(): MarkdownFenceTracker {
  let activeFence: { char: '`' | '~'; length: number } | null = null;

  return {
    consume: (line: string): boolean => {
      if (activeFence !== null) {
        if (isClosingFence(line, activeFence)) {
          activeFence = null;
        }

        return true;
      }

      const fenceOpen = parseFenceMarker(line);

      if (fenceOpen !== null) {
        activeFence = fenceOpen;

        return true;
      }

      return false;
    },
  };
}

export function parseMarkdownInline({
  text,
  fileMentions,
}: ParseMarkdownInlineProps): MarkdownInlineSegment[] {
  const segments: MarkdownInlineSegment[] = [];
  let current = '';
  let i = 0;

  const flushText = (): void => {
    if (current.length === 0) {
      return;
    }

    segments.push({ type: 'text', text: current });
    current = '';
  };

  while (i < text.length) {
    const inlineCode = readInlineCode(text, i);

    if (inlineCode !== null) {
      current += inlineCode.raw;
      i = inlineCode.end;
      continue;
    }

    if (text[i] === '!' && text[i + 1] === '[') {
      const image = readMarkdownLink(text, i + 1);

      if (image !== null) {
        current += `!${image.raw}`;
        i = image.end;
        continue;
      }
    }

    const markdownLink = readMarkdownLink(text, i);

    if (markdownLink !== null) {
      flushText();
      segments.push(markdownLink);
      i = markdownLink.end;
      continue;
    }

    const angleAutolink = readAngleAutolink(text, i);

    if (angleAutolink !== null) {
      flushText();
      segments.push(angleAutolink);
      i = angleAutolink.end;
      continue;
    }

    const bareUrl = readBareUrl(text, i);

    if (bareUrl !== null) {
      flushText();
      segments.push(bareUrl);
      i = bareUrl.end;
      continue;
    }

    if (fileMentions) {
      const mention = readFileMention(text, i);

      if (mention !== null) {
        flushText();
        segments.push(mention);
        i = mention.end;
        continue;
      }
    }

    current += text[i] ?? '';
    i += 1;
  }

  flushText();

  return segments;
}

export function resolveMarkdownLink({
  destination,
  currentPath,
  pathBase,
  fileResourceProviderId,
  localHeadingHrefPrefix,
}: ResolveMarkdownLinkProps): MarkdownResolvedLink | null {
  const trimmed = destination.trim();

  if (trimmed.length === 0) {
    return null;
  }

  if (trimmed.startsWith('#/resource/v1/')) {
    return { href: trimmed, external: false };
  }

  if (isUnsafeDestination(trimmed)) {
    return null;
  }

  if (/^https?:\/\//i.test(trimmed) || /^mailto:/i.test(trimmed)) {
    return { href: trimmed, external: true };
  }

  if (trimmed.startsWith('#')) {
    const slug = decodeHashSlug(trimmed.slice(1));

    if (slug.length === 0) {
      return null;
    }

    if (localHeadingHrefPrefix !== null) {
      return {
        href: `#${localHeadingHrefPrefix}-${slug}`,
        external: false,
      };
    }

    if (currentPath === null) {
      return { href: `#${slug}`, external: false };
    }

    return {
      href: workspaceFileResourceHref({
        providerId: fileResourceProviderId,
        path: currentPath,
        line: null,
        heading: slug,
      }),
      external: false,
    };
  }

  const hashIndex = trimmed.indexOf('#');
  const pathPart = hashIndex >= 0 ? trimmed.slice(0, hashIndex) : trimmed;

  const heading =
    hashIndex >= 0 ? decodeHashSlug(trimmed.slice(hashIndex + 1)) : null;

  const resolvedPath = resolveWorkspaceRelativePath({
    currentPath: pathBase === 'workspace' ? null : currentPath,
    destinationPath: pathPart,
  });

  if (resolvedPath === null) {
    return null;
  }

  return {
    href: workspaceFileResourceHref({
      providerId: fileResourceProviderId,
      path: resolvedPath,
      line: null,
      heading: heading !== null && heading.length > 0 ? heading : null,
    }),
    external: false,
  };
}

export function workspaceFileResourceHref({
  providerId,
  path,
  line,
  heading,
}: WorkspaceFileResourceHrefProps): string {
  return resourceAddressToHash({
    capability: ResourceViewV1.capability,
    providerId,
    resourceType: 'file',
    resourceId: JSON.stringify({
      path,
      line,
      ...(heading === null ? {} : { heading }),
    }),
  });
}

export function resolveWorkspaceRelativePath({
  currentPath,
  destinationPath,
}: ResolveWorkspaceRelativePathProps): string | null {
  const dest = destinationPath.replace(/\\/g, '/').trim();

  if (dest.length === 0) {
    return null;
  }

  const baseParts: string[] = [];

  if (!dest.startsWith('/')) {
    if (currentPath !== null && currentPath !== '' && currentPath !== '.') {
      const slash = currentPath.replace(/\\/g, '/').lastIndexOf('/');

      if (slash >= 0) {
        baseParts.push(...currentPath.slice(0, slash).split('/'));
      }
    }
  }

  const destParts = dest.startsWith('/')
    ? dest.slice(1).split('/')
    : dest.split('/');

  const out: string[] = [...baseParts];

  for (const part of destParts) {
    if (part.length === 0 || part === '.') {
      continue;
    }

    if (part === '..') {
      if (out.length === 0) {
        return null;
      }

      out.pop();
      continue;
    }

    out.push(part);
  }

  if (out.length === 0) {
    return null;
  }

  return out.join('/');
}

export function indexMarkdownHeadings(
  text: string,
): MarkdownHeadingIndexEntry[] {
  const entries: MarkdownHeadingIndexEntry[] = [];
  const usedSlugs = new Map<string, number>();
  const fence = createMarkdownFenceTracker();
  const lines = text.split(/\r?\n/);

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';

    if (fence.consume(line)) {
      continue;
    }

    const title = atxHeadingTitle(line);

    if (title === null || title.length === 0) {
      continue;
    }

    const baseSlug = slugifyHeading(title);

    if (baseSlug.length === 0) {
      continue;
    }

    const seen = usedSlugs.get(baseSlug) ?? 0;
    const slug = seen === 0 ? baseSlug : `${baseSlug}-${seen}`;
    usedSlugs.set(baseSlug, seen + 1);

    entries.push({
      lineNumber: i + 1,
      slug,
      title,
    });
  }

  return entries;
}

export function findMarkdownHeadingLine(
  text: string,
  slug: string,
): number | null {
  const match = indexMarkdownHeadings(text).find(
    (entry) => entry.slug === slug,
  );

  return match === undefined ? null : match.lineNumber;
}

export function headingDomId(prefix: string, slug: string): string {
  return `${prefix}-${slug}`;
}

function slugifyHeading(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s\-_]/gu, '')
    .replace(/\s+/g, '-');
}

function atxHeadingTitle(line: string): string | null {
  const match = /^ {0,3}#{1,6}(?:[ \t]+|$)(.*)$/.exec(line);

  if (!match) {
    return null;
  }

  return (match[1] ?? '').replace(/[ \t]+#+[ \t]*$/, '').trim();
}

function decodeHashSlug(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function isUnsafeDestination(destination: string): boolean {
  return /^(javascript|data|vbscript|file):/i.test(destination.trim());
}

function isLinkBoundary(char: string | undefined): boolean {
  return (
    char === undefined ||
    /\s/.test(char) ||
    char === '(' ||
    char === '[' ||
    char === '"' ||
    char === "'"
  );
}

type ReadResult = MarkdownInlineLinkSegment & { end: number };

function readInlineCode(
  text: string,
  start: number,
): { raw: string; end: number } | null {
  if (text[start] !== '`') {
    return null;
  }

  let ticks = 0;
  let i = start;

  while (text[i] === '`') {
    ticks += 1;
    i += 1;
  }

  const closer = '`'.repeat(ticks);
  const closeIndex = text.indexOf(closer, i);

  if (closeIndex < 0) {
    return null;
  }

  const end = closeIndex + ticks;

  return { raw: text.slice(start, end), end };
}

function readMarkdownLink(text: string, start: number): ReadResult | null {
  if (text[start] !== '[') {
    return null;
  }

  const labelEnd = findBalancedClosingBracket(text, start);

  if (labelEnd < 0 || text[labelEnd + 1] !== '(') {
    return null;
  }

  const destStart = labelEnd + 2;
  const parsedDest = readLinkDestination(text, destStart);

  if (parsedDest === null) {
    return null;
  }

  const label = text.slice(start + 1, labelEnd);
  const destination = parsedDest.destination;

  if (label.length === 0 && destination.length === 0) {
    return null;
  }

  return {
    type: 'link',
    label: label.length === 0 ? destination : label,
    destination,
    raw: text.slice(start, parsedDest.end),
    pathBase: 'current',
    end: parsedDest.end,
  };
}

function findBalancedClosingBracket(text: string, start: number): number {
  let depth = 0;

  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];

    if (ch === '\\') {
      i += 1;
      continue;
    }

    if (ch === '[') {
      depth += 1;
      continue;
    }

    if (ch === ']') {
      depth -= 1;

      if (depth === 0) {
        return i;
      }
    }

    if (ch === '\n') {
      return -1;
    }
  }

  return -1;
}

function readLinkDestination(
  text: string,
  start: number,
): { destination: string; end: number } | null {
  let i = start;

  while (text[i] === ' ' || text[i] === '\t') {
    i += 1;
  }

  if (i >= text.length) {
    return null;
  }

  let destination = '';

  if (text[i] === '<') {
    i += 1;

    while (i < text.length) {
      const ch = text[i];

      if (ch === '\n') {
        return null;
      }

      if (ch === '\\' && i + 1 < text.length) {
        destination += text[i + 1];
        i += 2;
        continue;
      }

      if (ch === '>') {
        i += 1;
        break;
      }

      destination += ch;
      i += 1;
    }
  } else {
    let depth = 0;

    while (i < text.length) {
      const ch = text[i];

      if (ch === '\n') {
        return null;
      }

      if (ch === '\\' && i + 1 < text.length) {
        destination += text[i + 1];
        i += 2;
        continue;
      }

      if (ch === '(') {
        depth += 1;
        destination += ch;
        i += 1;
        continue;
      }

      if (ch === ')') {
        if (depth === 0) {
          break;
        }

        depth -= 1;
        destination += ch;
        i += 1;
        continue;
      }

      if (/\s/.test(ch)) {
        break;
      }

      destination += ch;
      i += 1;
    }
  }

  while (text[i] === ' ' || text[i] === '\t') {
    i += 1;
  }

  if (text[i] === '"' || text[i] === "'" || text[i] === '(') {
    const opener = text[i];
    const closer = opener === '(' ? ')' : opener;
    i += 1;

    while (i < text.length && text[i] !== closer) {
      if (text[i] === '\n') {
        return null;
      }

      if (text[i] === '\\') {
        i += 1;
      }

      i += 1;
    }

    if (text[i] !== closer) {
      return null;
    }

    i += 1;

    while (text[i] === ' ' || text[i] === '\t') {
      i += 1;
    }
  }

  if (text[i] !== ')') {
    return null;
  }

  return { destination, end: i + 1 };
}

function readAngleAutolink(text: string, start: number): ReadResult | null {
  if (text[start] !== '<') {
    return null;
  }

  const rest = text.slice(start);
  const match = /^<(https?:\/\/[^>\s]+|mailto:[^>\s]+)>/i.exec(rest);

  if (!match || !match[1]) {
    return null;
  }

  const destination = match[1];
  const raw = match[0];

  return {
    type: 'link',
    label: destination,
    destination,
    raw,
    pathBase: 'current',
    end: start + raw.length,
  };
}

function readBareUrl(text: string, start: number): ReadResult | null {
  if (!isLinkBoundary(text[start - 1])) {
    return null;
  }

  const rest = text.slice(start);
  const match = /^(https?:\/\/[^\s<>"'`]+)/i.exec(rest);

  if (!match || !match[1]) {
    return null;
  }

  let destination = match[1];

  while (
    destination.length > 0 &&
    TRAILING_URL_PUNCTUATION.has(destination[destination.length - 1] ?? '')
  ) {
    destination = destination.slice(0, -1);
  }

  if (!/^https?:\/\/[^\s]+/i.test(destination)) {
    return null;
  }

  return {
    type: 'link',
    label: destination,
    destination,
    raw: destination,
    pathBase: 'current',
    end: start + destination.length,
  };
}

function readFileMention(text: string, start: number): ReadResult | null {
  if (text[start] !== '@') {
    return null;
  }

  if (!isLinkBoundary(text[start - 1])) {
    return null;
  }

  const rest = text.slice(start + 1);

  const match = /^((?:\.\/|\.\.\/|[A-Za-z0-9._-]+\/)[A-Za-z0-9._/-]*)/.exec(
    rest,
  );

  if (!match || !match[1]) {
    return null;
  }

  let path = match[1];

  while (
    path.length > 0 &&
    TRAILING_URL_PUNCTUATION.has(path[path.length - 1] ?? '')
  ) {
    path = path.slice(0, -1);
  }

  if (!path.includes('/')) {
    return null;
  }

  return {
    type: 'link',
    label: `@${path}`,
    destination: path,
    raw: `@${path}`,
    pathBase: 'workspace',
    end: start + 1 + path.length,
  };
}
