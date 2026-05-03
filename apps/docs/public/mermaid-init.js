// Client-side mermaid bootstrap. Loaded by every page via vocs.config.ts
// `head`. With the `pre-mermaid` rehype strategy, the build emits
// <pre class="mermaid"> nodes; this script converts them to SVG.
import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';

const isDark =
  document.documentElement.classList.contains('dark') ||
  window.matchMedia('(prefers-color-scheme: dark)').matches;

mermaid.initialize({
  startOnLoad: false,
  theme: isDark ? 'dark' : 'default',
  securityLevel: 'loose',
});

// Vocs uses client-side routing; mermaid.run() must be re-invoked after
// each route change so newly mounted <pre class="mermaid"> nodes render.
async function renderAll() {
  const nodes = document.querySelectorAll('pre.mermaid:not([data-processed="true"])');
  if (nodes.length > 0) {
    await mermaid.run({ nodes });
  }
}

// Initial render after first paint.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', renderAll);
} else {
  renderAll();
}

// Re-render on SPA navigation. Vocs uses react-router under the hood;
// MutationObserver on the content container catches new diagram nodes.
const observer = new MutationObserver(() => {
  renderAll();
});
observer.observe(document.body, { childList: true, subtree: true });
