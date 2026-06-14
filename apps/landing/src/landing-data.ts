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
    href: '/todo-app',
    packageName: 'appweaver-todo-plugin',
    repo: 'nostr://_@getappweaver.com/todo',
    displayName: 'Todo App',
    shortName: 'Todo',
  },
  {
    name: 'Bookmark manager',
    label: '/bm',
    description: 'Save, search, categorize, and publish bookmark collections.',
    href: '/bookmark-manager',
    packageName: 'appweaver-bm-plugin',
    repo: 'nostr://_@getappweaver.com/bm',
    displayName: 'Bookmark Manager',
    shortName: 'Bookmark',
  },
  {
    name: "Captain's Log",
    label: '/journal',
    description: 'Capture private notes, search entries, and publish deliberately.',
    href: '/captains-log',
    packageName: 'appweaver-journal-plugin',
    repo: 'nostr://_@getappweaver.com/journal',
    displayName: "Captain's Log",
    shortName: 'Journal',
  },
  {
    name: 'Job scheduler',
    label: '/job',
    description: 'Schedule recurring or one-off jobs for AppWeaver to run later.',
    href: '/job-scheduler',
    packageName: 'appweaver-job-plugin',
    repo: 'nostr://_@getappweaver.com/job',
    displayName: 'Job Scheduler',
    shortName: 'Job',
  },
  {
    name: 'File manager',
    label: '/file',
    description: 'Browse workspace trees and inspect project files from AppWeaver.',
    href: '/file-manager',
    packageName: 'appweaver-file-plugin',
    repo: 'nostr://_@getappweaver.com/file',
    displayName: 'File Manager',
    shortName: 'File',
  },
];

export const socialLinks: SocialLink[] = [
  { label: 'GitHub', href: 'https://github.com/getappweaver' },
  { label: 'Nostr Git', href: 'https://gitworkshop.dev/getappweaver.com' },
  { label: 'Nostr', href: 'https://nosta.me/getappweaver.com' },
  { label: 'X', href: 'https://x.com/getappweaver' },
  { label: 'LinkedIn', href: 'https://www.linkedin.com/company/getappweaver' },
];
