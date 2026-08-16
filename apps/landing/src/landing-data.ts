export type OfficialApp = {
  name: string;
  label: string;
  description: string;
  href: string;
  packageName: string;
  repo: string;
  displayName: string;
  shortName: string;
  features: string[];
  hasInteractiveDemo: boolean;
};

export type SocialLink = {
  label: string;
  href: string;
};

export const officialAuthor = {
  label: '_@getappweaver.com',
  href: 'https://gitworkshop.dev/getappweaver.com',
} as const;

export const officialApps: OfficialApp[] = [
  {
    name: 'Todo app',
    label: '/todo',
    description:
      'Official AppWeaver Todo app. Adds focused AI-powered todo tools, commands, and data models to an AppWeaver workspace.',
    href: '/apps/todo',
    packageName: 'appweaver-todo-plugin',
    repo: 'nostr://_@getappweaver.com/relay.ngit.dev/todo',
    displayName: 'Todo App',
    shortName: 'Todo',
    hasInteractiveDemo: true,
    features: [
      'Create structured tasks from chat, web UI actions, or AI prompts.',
      'Focus on one part of the todo tree when you want to work in detail.',
      'Copy part of the tree structurally and paste it into any model you want to work with.',
      'AI agents cannot edit your todos directly; they create drafts that you can accept, revise, or decline.',
      'Your local todo app, accessible from anywhere you use AppWeaver.',
    ],
  },
  {
    name: 'Bookmark manager',
    label: '/bm',
    description: 'Save, search, categorize, and publish bookmark collections.',
    href: '/apps/bookmark-manager',
    packageName: 'appweaver-bm-plugin',
    repo: 'nostr://_@getappweaver.com/relay.ngit.dev/bm',
    displayName: 'Bookmark Manager',
    shortName: 'Bookmark',
    hasInteractiveDemo: true,
    features: [
      'Your local bookmarks, accessible from anywhere you use AppWeaver.',
      'Ask AI to inspect a link or search for something, then draft a bookmark with a useful description, tags, and category.',
      'Publish selected bookmark sets only when you deliberately choose to share.',
    ],
  },
  {
    name: "Captain's Log",
    label: '/journal',
    description: 'Capture private notes, search entries, and publish deliberately.',
    href: '/apps/captains-log',
    packageName: 'appweaver-journal-plugin',
    repo: 'nostr://_@getappweaver.com/relay.ngit.dev/journal',
    displayName: "Captain's Log",
    shortName: 'Journal',
    hasInteractiveDemo: true,
    features: [
      'Capture private workspace notes as a local Captain\'s Log.',
      'Stroll through entries like a real notepad instead of treating every note as a search result.',
      'Publish selected logs only after reviewing the exact draft.',
    ],
  },
  {
    name: 'Job scheduler',
    label: '/job',
    description: 'Schedule recurring or one-off jobs for AppWeaver to run later.',
    href: '/apps/job-scheduler',
    packageName: 'appweaver-job-plugin',
    repo: 'nostr://_@getappweaver.com/relay.ngit.dev/job',
    displayName: 'Job Scheduler',
    shortName: 'Job',
    hasInteractiveDemo: true,
    features: [
      'Schedule one-off or recurring prompts from the same app hub.',
      'Use natural language like "Run X each Monday at 8am" and AppWeaver creates the job in your timezone.',
      'Automate checks, reminders, publishing, and maintenance without leaving your workspace.',
    ],
  },
  {
    name: 'File manager',
    label: '/file',
    description: 'Browse workspace trees and inspect project files from AppWeaver.',
    href: '/apps/file-manager',
    packageName: 'appweaver-file-plugin',
    repo: 'nostr://_@getappweaver.com/relay.ngit.dev/file',
    displayName: 'File Manager',
    shortName: 'File',
    hasInteractiveDemo: true,
    features: [
      'Browse workspace trees without leaving the AppWeaver UI.',
      'Ask for folder summaries and bottom-up context before editing code.',
      'Review git diffs in the UI so you can check what changed before moving on.',
    ],
  },
  {
    name: 'Nostr Radar',
    label: '/nr',
    description:
      'Explore Nostr by topic, discover posts through overlooked social signals, and privately rank what matters to you.',
    href: '/apps/nostr-radar',
    packageName: 'appweaver-nr-plugin',
    repo: 'nostr://_@getappweaver.com/relay.ngit.dev/Nostr-Radar',
    displayName: 'Nostr Radar',
    shortName: 'Nostr',
    hasInteractiveDemo: false,
    features: [
      'Fetch and evaluate posts in finite time slots instead of browsing an infinite feed.',
      'See the 25 most relevant evaluated posts in For You using private local scoring signals.',
      'Filter Timeline and For You by time slot, preferred topics, and unpreferred topics.',
      'Surface reactions, not just reposts or quotes.',
      'Archive important posts to collect or revisit later.',
    ],
  },
];

export const socialLinks: SocialLink[] = [
  { label: 'GitHub', href: 'https://github.com/getappweaver' },
  { label: 'Nostr Git', href: 'https://gitworkshop.dev/getappweaver.com' },
  { label: 'Nostr', href: 'https://nosta.me/getappweaver.com' },
  { label: 'X', href: 'https://x.com/getappweaver' },
  { label: 'LinkedIn', href: 'https://www.linkedin.com/company/getappweaver' },
];
