import type { WebStyleSheet } from '@src/web/ui-schema';

export const roadmapWebCss = `
  .web-tree.roadmap-layout {
    gap: 0.85rem;
  }

  .web-row.roadmap-header {
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
  }

  .web-box.roadmap-card,
  .web-box.roadmap-section {
    background: color-mix(in srgb, var(--color-panel, #242424) 92%, transparent);
  }

  .web-stack.roadmap-board-summary {
    padding: 0.25rem 0.1rem 0.45rem;
  }

  .web-stack.roadmap-inline-new-wrap {
    padding-top: 5px;
  }

  .web-treeItem.roadmap-status {
    padding: 0.55rem 0.6rem;
    border-radius: var(--radius-md, 0.5rem);
    border: 1px solid color-mix(in srgb, var(--roadmap-status-color, #7c7c7c) 35%, transparent);
    background: color-mix(in srgb, var(--roadmap-status-color, #7c7c7c) 18%, var(--color-panel, #242424));
  }

  .web-treeItem.roadmap-status > .web-tree-item-summary {
    color: color-mix(in srgb, var(--roadmap-status-color, currentColor) 70%, var(--color-text, currentColor));
  }

  .web-treeItem.roadmap-status-pending { --roadmap-status-color: #f59e0b; }
  .web-treeItem.roadmap-status-unassigned { --roadmap-status-color: #f59e0b; }
  .web-treeItem.roadmap-status-next { --roadmap-status-color: #38bdf8; }
  .web-treeItem.roadmap-status-in-progress { --roadmap-status-color: #a78bfa; }
  .web-treeItem.roadmap-status-done { --roadmap-status-color: #22c55e; }
  .web-treeItem.roadmap-status-shipped { --roadmap-status-color: #22c55e; }
  .web-treeItem.roadmap-status-rejected { --roadmap-status-color: #ef4444; }
  .web-treeItem.roadmap-status-archived { --roadmap-status-color: #eab308; }
  .web-treeItem.roadmap-status-archive { --roadmap-status-color: #eab308; }

  .web-treeItem.roadmap-issue-item {
    padding: 0.38rem 0.25rem 0.38rem 0.65rem;
    border-left: 2px solid color-mix(in srgb, var(--color-accent, #60a5fa) 45%, transparent);
  }

  .web-treeItem.roadmap-issue-item > .web-tree-item-children {
    margin-top: 0.45rem;
    margin-left: 0.85rem;
  }

  .web-stack.roadmap-issue-details {
    padding: 0.1rem 0 0.2rem;
  }

  .web-text.roadmap-description {
    display: block;
    padding: 0.1rem 0 0.15rem;
    color: color-mix(in srgb, var(--color-text, currentColor) 82%, var(--color-text-muted, currentColor));
  }

  .web-text.roadmap-description .web-button.roadmap-meta-action {
    text-decoration: underline;
  }

  .web-text.roadmap-readable-muted {
    color: color-mix(in srgb, var(--color-text, currentColor) 78%, var(--color-text-muted, currentColor));
    font-size: 0.86em;
  }

  .web-row.roadmap-meta-badges {
    flex-wrap: wrap;
  }

  .web-badge.roadmap-meta-badge,
  .web-badge.roadmap-label-badge {
    border-radius: 999px;
    color: var(--color-text, currentColor);
    background: color-mix(in srgb, var(--color-text, currentColor) 14%, var(--color-panel, #242424));
  }

  .web-badge.roadmap-label-badge {
    color: #fff;
    background: color-mix(in srgb, var(--color-accent, #60a5fa) 55%, #000);
    font-size: 0.68rem;
  }

  button.web-badge.roadmap-label-badge {
    cursor: pointer;
    font: inherit;
    font-size: 0.68rem;
    line-height: inherit;
  }

  button.web-badge.roadmap-label-badge:hover,
  button.web-badge.roadmap-label-badge:focus-visible,
  button.web-badge.roadmap-label-badge.is-active {
    outline: 1px solid var(--color-warning, currentColor);
    outline-offset: 1px;
  }

  .web-badge.roadmap-label-badge-bug {
    background: color-mix(in srgb, #ef4444 72%, #000);
  }

  .web-badge.roadmap-label-badge-feature {
    background: color-mix(in srgb, #22c55e 68%, #000);
  }

  .web-button.roadmap-meta-action {
    padding: 0;
    border: 0;
    color: var(--color-text-muted, currentColor);
    background: transparent;
    box-shadow: none;
    font: inherit;
    text-decoration: none;
  }

  .web-button.roadmap-meta-action:hover,
  .web-button.roadmap-meta-action:focus-visible {
    color: var(--color-accent, currentColor);
    background: transparent;
    text-decoration: underline;
  }

  .web-stack.roadmap-comments-panel,
  .web-stack.roadmap-management-panel {
    margin-top: 0.15rem;
    padding: 0.65rem;
    background: color-mix(in srgb, var(--color-panel, #242424) 82%, var(--color-text, currentColor) 7%);
  }

  .web-stack.roadmap-comment-item {
    padding: 0.45rem 0;
    border-bottom: 1px solid color-mix(in srgb, var(--color-text, currentColor) 12%, transparent);
  }

  .web-stack.roadmap-comment-item:last-child {
    border-bottom: 0;
  }

  .web-form.roadmap-mark-row {
    display: flex;
    gap: 0.45rem;
    align-items: center;
    flex-wrap: wrap;
    margin-top: 0.2rem;
    padding-top: 0.35rem;
  }

  .web-form.roadmap-mark-row .web-select {
    min-width: 8rem;
  }

  .web-row.roadmap-issue-head {
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .web-stack.roadmap-issue-main {
    padding-bottom: 0.5rem;
    border-bottom: 1px solid color-mix(in srgb, var(--color-text, currentColor) 12%, transparent);
    min-width: 0;
    flex: 1;
  }

  .web-row.roadmap-badges {
    flex-wrap: wrap;
  }

  .web-button.roadmap-issue-title {
    overflow-wrap: anywhere;
    display: inline;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    color: var(--color-text, currentColor);
    cursor: pointer;
    font-size: 1rem;
    font-weight: 700;
    text-align: left;
    box-shadow: none;
    transition: color 120ms ease, background 120ms ease;
  }

  .web-row.roadmap-issue-summary {
    width: 100%;
    align-items: center;
    flex-wrap: nowrap;
    gap: 0.5rem;
  }

  .web-row.roadmap-issue-summary > .roadmap-issue-title {
    flex: 1 1 auto;
    min-width: 0;
  }

  .web-row.roadmap-issue-summary-actions {
    margin-left: auto;
    flex: 0 0 auto;
    align-items: center;
    flex-wrap: nowrap;
  }

  .web-button.roadmap-issue-title:hover,
  .web-button.roadmap-issue-title:focus-visible {
    color: var(--color-warning, currentColor);
    background: transparent;
    text-decoration: underline;
  }

  .web-text.roadmap-section-title {
    font-family: monospace;
    font-size: 1.22rem;
    line-height: 1.2;
  }

  .web-row.roadmap-section-title-row {
    align-items: center;
    gap: 0.5rem;
  }

  .web-row.roadmap-issue-modal-title-row {
    width: 100%;
    align-items: center;
    flex-wrap: nowrap;
    gap: 0.5rem;
  }

  .web-row.roadmap-issue-modal-title-row > .roadmap-section-title {
    flex: 1 1 auto;
    min-width: 0;
  }

  .web-row.roadmap-issue-modal-actions {
    margin-left: auto;
    flex: 0 0 auto;
    align-items: center;
    flex-wrap: nowrap;
  }

  .web-link.roadmap-board-author {
    margin-left: auto;
    font-size: 0.82rem;
    white-space: nowrap;
  }

  .web-text.roadmap-issue-title:hover {
    color: var(--color-accent, #60a5fa);
    background: color-mix(in srgb, var(--color-accent, #60a5fa) 13%, transparent);
  }

  .web-text.roadmap-money {
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }

  .web-stack.roadmap-fund-modal {
    padding-bottom: 0.75rem;
  }

  .web-button.roadmap-money-button {
    padding: 0.12rem 0.35rem;
    border-radius: 0.25rem;
    color: var(--color-success, currentColor);
    background: transparent;
    box-shadow: none;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .web-button.roadmap-money-button:hover {
    color: #000;
    background: var(--color-warning);
  }

  .web-button.roadmap-money-button-summary {
    padding-inline: 0.45rem;
  }

  .web-button.roadmap-money-button-modal {
    padding-inline: 0.5rem;
  }

  .web-button.roadmap-new-issue-button {
    justify-self: start;
    width: auto;
    border-radius: 0;
    border-color: color-mix(in srgb, var(--color-warning) 72%, transparent);
    color: var(--color-warning);
    background: #000;
    box-shadow: none;
    font-weight: 700;
    letter-spacing: 0.03em;
  }

  .web-button.roadmap-new-issue-button:hover {
    color: #000;
    background: var(--color-warning);
  }
`;

export const roadmapStylesheet: WebStyleSheet = {
  id: 'roadmap-web',
  cssText: roadmapWebCss,
};
