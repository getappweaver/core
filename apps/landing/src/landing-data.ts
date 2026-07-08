export type OfficialApp = {
  name: string;
  label: string;
  description: string;
  href: string;
  packageName: string;
  repo: string;
  displayName: string;
  shortName: string;
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
  },
  {
    name: 'Nostr Radar',
    label: '/nr',
    description:
      'An intentional Nostr reader for AppWeaver. Fetch posts from your follows, classify them with AI, and review the important conversations by topic, mood, timeline, or archive.',
    href: '/apps/nostr-radar',
    packageName: 'appweaver-nr-plugin',
    repo: 'nostr://_@getappweaver.com/relay.ngit.dev/Nostr-Radar',
    displayName: 'Nostr Radar',
    shortName: 'Nostr',
  },
];

export const socialLinks: SocialLink[] = [
  { label: 'GitHub', href: 'https://github.com/getappweaver' },
  { label: 'Nostr Git', href: 'https://gitworkshop.dev/getappweaver.com' },
  { label: 'Nostr', href: 'https://nosta.me/getappweaver.com' },
  { label: 'X', href: 'https://x.com/getappweaver' },
  { label: 'LinkedIn', href: 'https://www.linkedin.com/company/getappweaver' },
];
