import { For, Show } from 'solid-js';

import './blog.css';

type BlogEvent = {
  created_at?: number;
  tags?: string[][];
};

type BlogWrapper = {
  event?: BlogEvent;
};

type BlogPostPreview = {
  title: string;
  summary: string;
  href: string;
  publishedAt: number;
  tags: string[];
};

const blogWrapperModules = import.meta.glob('../blog/*.json', {
  eager: true,
});

function tagValue(event: BlogEvent, name: string): string | null {
  return event.tags?.find((tag) => tag[0] === name)?.[1] ?? null;
}

function tagValues(event: BlogEvent, name: string): string[] {
  return (
    event.tags
      ?.filter((tag) => tag[0] === name)
      .map((tag) => tag[1])
      .filter((value): value is string => Boolean(value)) ?? []
  );
}

function moduleDefault(value: unknown): BlogWrapper {
  if (value && typeof value === 'object' && 'default' in value) {
    return (value as { default: BlogWrapper }).default;
  }

  return value as BlogWrapper;
}

function postPreviewFromWrapper(value: unknown): BlogPostPreview | null {
  const wrapper = moduleDefault(value);
  const event = wrapper.event;

  if (!event) {
    return null;
  }

  const slug = tagValue(event, 'd');

  if (!slug) {
    return null;
  }

  const publishedAtRaw = tagValue(event, 'published_at');
  const publishedAt = publishedAtRaw ? Number(publishedAtRaw) : event.created_at;

  return {
    title: tagValue(event, 'title') ?? slug,
    summary: tagValue(event, 'summary') ?? '',
    href: `/blog/${encodeURIComponent(slug)}/`,
    publishedAt: Number.isFinite(publishedAt) ? Number(publishedAt) : 0,
    tags: tagValues(event, 't'),
  };
}

export const latestBlogPosts = Object.values(blogWrapperModules)
  .map(postPreviewFromWrapper)
  .filter((post): post is BlogPostPreview => post !== null)
  .sort((a, b) => b.publishedAt - a.publishedAt)
  .slice(0, 5);

export function BlogPostsSection() {
  return (
    <section class="blog-posts-panel" aria-labelledby="blog-posts-title">
      <div class="section-heading-row">
        <h2 id="blog-posts-title" class="section-title blog-posts-title">
          <a href='/blog'>Latest Blog Posts</a>
        </h2>
      </div>

      <Show
        when={latestBlogPosts.length > 0}
        fallback={<p class="blog-empty-message">No blog posts published yet.</p>}
      >
        <div class="blog-post-list">
          <For each={latestBlogPosts}>
            {(post) => (
              <article class="blog-post-card">
                <a href={post.href} class="blog-post-card-title">
                  {post.title}
                </a>
                <p>{post.summary}</p>
              </article>
            )}
          </For>
        </div>
      </Show>
    </section>
  );
}
