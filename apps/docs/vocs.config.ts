import { defineConfig } from 'vocs';

export default defineConfig({
  title: 'Filler SDK',
  titleTemplate: '%s · Filler SDK',
  description: 'Tres archivos y un bond. Deploy vertical UniswapX solvers in npm install.',
  rootDir: '.',
  baseUrl: 'https://docs.filler-sdk.xyz',

  iconUrl: '/icon.svg',
  ogImageUrl: 'https://docs.filler-sdk.xyz/og.png',

  theme: {
    accentColor: { dark: '#06b6d4', light: '#0891b2' },
    colorScheme: 'system',
    variables: {
      color: {
        background: { light: '#ffffff', dark: '#09090b' },
      },
    },
  },

  font: {
    google: 'Inter',
    mono: { google: 'JetBrains Mono' },
  },

  topNav: [
    { text: 'Docs', link: '/docs/intro' },
    { text: 'Recipes', link: '/recipes' },
    { text: 'API', link: '/api/sdk' },
    { text: 'GitHub', link: 'https://github.com/filler-sdk/filler-sdk' },
  ],

  socials: [
    { icon: 'github', link: 'https://github.com/filler-sdk/filler-sdk' },
  ],

  sidebar: [
    {
      text: 'Getting Started',
      items: [
        { text: 'Introduction', link: '/docs/intro' },
        { text: 'Quickstart', link: '/docs/quickstart' },
        { text: 'First Fill in 5 Minutes', link: '/docs/first-fill' },
      ],
    },
    {
      text: 'Concepts',
      items: [
        { text: 'Atomic JIT Pattern', link: '/docs/concepts/atomic-jit' },
        { text: 'JIT Inventory Hints', link: '/docs/concepts/jit-hints' },
        { text: 'Bond Mechanism', link: '/docs/concepts/bond' },
        { text: 'Topology', link: '/docs/concepts/topology' },
        { text: 'Verticals', link: '/docs/concepts/verticals' },
      ],
    },
    {
      text: 'Guides',
      items: [
        { text: 'Deploying a Solver', link: '/docs/guides/deploy' },
        { text: 'Bond Lifecycle', link: '/docs/guides/bond' },
        { text: 'KeeperHub Integration', link: '/docs/guides/keeperhub' },
        { text: 'Production Checklist', link: '/docs/guides/production' },
      ],
    },
    {
      text: 'Recipes',
      items: [
        { text: 'Overview', link: '/recipes' },
        { text: 'Simple JIT', link: '/recipes/simple-jit' },
        { text: 'LVR-Aware', link: '/recipes/lvr-aware' },
        { text: 'Treasury Rebalance', link: '/recipes/treasury-rebalance' },
        { text: 'Hook-Specific', link: '/recipes/hooks' },
      ],
    },
    {
      text: 'API Reference',
      items: [
        { text: 'SDK', link: '/api/sdk' },
        { text: 'JIT Hints Indexer', link: '/api/jit-hints' },
        { text: 'CLI', link: '/api/cli' },
        { text: 'Contracts', link: '/api/contracts' },
      ],
    },
    {
      text: 'Resources',
      items: [
        { text: 'FEEDBACK.md', link: '/resources/feedback' },
        { text: 'ADRs', link: '/resources/adrs' },
        { text: 'Changelog', link: '/resources/changelog' },
        { text: 'Roadmap', link: '/resources/roadmap' },
      ],
    },
  ],

  editLink: {
    pattern: 'https://github.com/filler-sdk/filler-sdk/edit/main/apps/docs/pages/:path',
    text: 'Edit this page on GitHub',
  },

  markdown: {
    code: {
      themes: {
        light: 'github-light',
        dark: 'github-dark',
      },
    },
  },
});
