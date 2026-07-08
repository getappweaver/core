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
