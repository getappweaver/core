export type LandingFeature = {
  title: string;
  points: string[];
};

export const landingFeatures: LandingFeature[] = [
  {
    title: 'Local-First App Hub',
    points: [
      'Install AppWeaver to and run for any project or workspace folder you control.',
      'Use apps that can work with your local filesystem and databases, create files, inspect project state, and show visual git diffs.',
      'You can setup a local AI model, Text to Speach (TTS) engine, and push notifications. Be private as you want to be.',
    ],
  },
  {
    title: 'Installable Apps And Plugin Manager',
    points: [
      'Browse apps in the plugin manager, then download and use the ones that belong in your hub.',
      'Install focused apps like <a href="/apps/todo">todos</a>, <a href="/apps/bookmark-manager">bookmarks</a>, <a href="/apps/job-scheduler">jobs</a>, <a href="/apps/nostr-radar">social media</a>, <a href="/apps/file-manager">files</a>, browser actions, <a href="/apps/captains-log">journals</a>.',
      'Anyone can publish an app into the ecosystem.',
      'Apps expose commands, widgets, AI skills, and promptable tools.',
    ],
  },
  {
    title: 'Many Interfaces, One Command System',
    points: [
      'Use AppWeaver through the web UI, web prompt, CLI, or your favourite Nostr chat app that supports private DM chat.',
      'Run the same command-based system across many interfaces.',
      'Use apps through special AI prompts, or through regular chat prompts via generated app skills.',
    ],
  },
  {
    title: 'Your AI Models, Your Workspace',
    points: [
      'Run AI tasks with OpenCode and choose models from the active model source for your workspace.',
      'Install model-source apps to add their own catalogs and provider configuration.',
      "Use app-specific payment options; like NWC lightning connections or Cashu eCash where it's supported.",
    ],
  },
  {
    title: 'Nostr-Native Assistant',
    points: [
      'AppWeaver runs with a Nostr bot identity that can send and receive private DMs through the Nostr network.',
      'Use your normal Nostr chat app as an interface to your local AppWeaver instance.',
      'Give different projects different AppWeaver instances and independent Nostr identities.',
    ],
  },
  {
    title: 'Responsive Web App',
    points: [
      'Works on wide desktop screens and mobile screens.',
      'Desktop gets docked widgets and a workspace-style layout.',
      'Mobile keeps the same apps, commands, and prompts usable in a smaller interface.',
      'Push notifications keep you updated when an app or assistant needs your attention.',
    ],
  },
  {
    title: 'Assistant Cards That Can Speak',
    points: [
      'AI assistant cards support Piper TTS.',
      'Long responses and important updates can be read aloud locally.',
      'Reading is attached to the cards you already use, not a separate assistant surface.',
    ],
  },
  {
    title: 'Open Source And Community Signal',
    points: [
      'AppWeaver is open-source software with an open and transparent roadmap.',
      'Roadmap issues and feature requests can be discussed in public.',
      'Vote on issues with sats to create signal about which fixes and features matter most.',
    ],
  },
];
