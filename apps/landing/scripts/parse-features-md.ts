import type {
  PluginCatalogFeature,
  PluginFeatureMedia,
  PluginFeatureShowcase,
  PluginFeatureStatus,
  PluginFeatureSurface,
} from '../content-types';

export type ParseFeaturesMdProps = {
  markdown: string;
  pluginAlias: string;
};

const VALID_STATUSES = new Set<PluginFeatureStatus>(['draft', 'beta', 'stable', 'deprecated']);
const VALID_SURFACES = new Set<PluginFeatureSurface>(['web', 'cli', 'dm']);
const VALID_SHOWCASES = new Set<PluginFeatureShowcase>(['none', 'app', 'home']);

export function parseFeaturesMd({
  markdown,
  pluginAlias,
}: ParseFeaturesMdProps): PluginCatalogFeature[] {
  const lines = markdown.split(/\r?\n/);
  const headingRegex = /^##\s+(.+?)\s+\{#([a-z0-9._-]+)\}\s*$/;

  const sections: { title: string; id: string; lines: string[] }[] = [];
  let currentSection: { title: string; id: string; lines: string[] } | null = null;
  const seenIds = new Set<string>();

  for (const line of lines) {
    const headingMatch = line.match(headingRegex);
    if (headingMatch) {
      const title = headingMatch[1].trim();
      const id = headingMatch[2].trim();

      if (!id.startsWith(`${pluginAlias}.`)) {
        throw new Error(
          `Feature ID "${id}" in plugin "${pluginAlias}" must start with prefix "${pluginAlias}."`,
        );
      }

      if (seenIds.has(id)) {
        throw new Error(`Duplicate feature ID "${id}" in plugin "${pluginAlias}"`);
      }
      seenIds.add(id);

      currentSection = { title, id, lines: [] };
      sections.push(currentSection);
    } else if (currentSection) {
      // Level 2 headings without an ID anchor (like ## Metadata convention) close the previous feature section
      if (/^##\s+/.test(line)) {
        currentSection = null;
      } else {
        currentSection.lines.push(line);
      }
    }
  }

  const features: PluginCatalogFeature[] = [];

  for (const section of sections) {
    let status: PluginFeatureStatus = 'stable';
    let tags: string[] = [];
    let surfaces: PluginFeatureSurface[] = ['web'];
    let showcase: PluginFeatureShowcase = 'none';
    let order = 999;
    const media: PluginFeatureMedia = {
      poster: null,
      video: null,
    };

    let inBullets = true;
    let inMedia = false;
    const descLines: string[] = [];

    for (let i = 0; i < section.lines.length; i++) {
      const line = section.lines[i];
      const trimmed = line.trim();

      if (inBullets) {
        if (trimmed.startsWith('- Status:')) {
          const val = trimmed.replace(/^- Status:\s*/, '').trim().toLowerCase();
          if (VALID_STATUSES.has(val as PluginFeatureStatus)) {
            status = val as PluginFeatureStatus;
          }
          inMedia = false;
          continue;
        }

        if (trimmed.startsWith('- Tags:')) {
          tags = trimmed
            .replace(/^- Tags:\s*/, '')
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean);
          inMedia = false;
          continue;
        }

        if (trimmed.startsWith('- Surfaces:')) {
          const parsedSurfaces = trimmed
            .replace(/^- Surfaces:\s*/, '')
            .split(',')
            .map((s) => s.trim().toLowerCase())
            .filter((s): s is PluginFeatureSurface => VALID_SURFACES.has(s as PluginFeatureSurface));
          if (parsedSurfaces.length > 0) {
            surfaces = parsedSurfaces;
          }
          inMedia = false;
          continue;
        }

        if (trimmed.startsWith('- Showcase:')) {
          const val = trimmed.replace(/^- Showcase:\s*/, '').trim().toLowerCase();
          if (VALID_SHOWCASES.has(val as PluginFeatureShowcase)) {
            showcase = val as PluginFeatureShowcase;
          }
          inMedia = false;
          continue;
        }

        if (trimmed.startsWith('- Order:')) {
          const num = parseInt(trimmed.replace(/^- Order:\s*/, '').trim(), 10);
          if (!Number.isNaN(num)) {
            order = num;
          }
          inMedia = false;
          continue;
        }

        if (trimmed === '- Media:' || trimmed.startsWith('- Media:')) {
          inMedia = true;
          continue;
        }

        if (inMedia && (trimmed.startsWith('- poster:') || trimmed.startsWith('poster:'))) {
          media.poster = trimmed.replace(/^-?\s*poster:\s*/, '').trim() || null;
          continue;
        }

        if (inMedia && (trimmed.startsWith('- video:') || trimmed.startsWith('video:'))) {
          media.video = trimmed.replace(/^-?\s*video:\s*/, '').trim() || null;
          continue;
        }

        if (trimmed === '') {
          // Blank line after bullets signals transition to description paragraphs
          if (status || tags.length > 0) {
            inBullets = false;
            inMedia = false;
            continue;
          }
        } else if (!trimmed.startsWith('-')) {
          inBullets = false;
          inMedia = false;
          descLines.push(line);
          continue;
        }
      } else {
        descLines.push(line);
      }
    }

    const rawParagraphs = descLines
      .join('\n')
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    const publicParagraphs = rawParagraphs.filter((p) => {
      if (p.startsWith('Implementation:') || p.startsWith('Implementation :')) {
        return false;
      }
      if (p.startsWith('Background:') || p.startsWith('Background :')) {
        return false;
      }
      return true;
    });

    const description = publicParagraphs.join('\n\n');

    features.push({
      id: section.id,
      title: section.title,
      status,
      tags,
      surfaces,
      showcase,
      order,
      media,
      description,
    });
  }

  // Deterministic sort: (a.order - b.order) || a.id.localeCompare(b.id)
  features.sort((a, b) => {
    if (a.order !== b.order) {
      return a.order - b.order;
    }
    return a.id.localeCompare(b.id);
  });

  return features;
}
