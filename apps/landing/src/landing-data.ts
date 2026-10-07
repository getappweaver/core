import type { LandingApp } from '../content-types';

export { officialApps } from './generated/plugin-content';
export type OfficialApp = LandingApp;

export type SocialLink = { label: string; href: string };

export const officialAuthor = {
  label: '_@getappweaver.com',
  href: 'https://gitworkshop.dev/getappweaver.com',
} as const;

export const socialLinks: SocialLink[] = [
  { label: 'GitHub', href: 'https://github.com/getappweaver' },
  { label: 'Nostr Git', href: 'https://gitworkshop.dev/getappweaver.com' },
  { label: 'Nostr', href: 'https://nosta.me/getappweaver.com' },
  { label: 'X', href: 'https://x.com/getappweaver' },
  { label: 'LinkedIn', href: 'https://www.linkedin.com/company/getappweaver' },
];
