<script lang="ts">
  import type { QueuedFile } from '@airflac/shared';

  import { downloadFileUrl } from '../lib/api.js';
  import {
    formatBitDepth,
    formatBytes,
    formatChannels,
    formatDuration,
    formatSampleRate,
  } from '../lib/format.js';
  import { IN_PROGRESS_STATUSES, STATUS_LABELS, sizeGrew, sizeSummary } from '../lib/queueDisplay.js';
  import { airflac } from '../lib/stores/queue.svelte.js';
  import FileDetails from './FileDetails.svelte';
  import ProgressBar from './ProgressBar.svelte';

  interface Props {
    file: QueuedFile;
  }

  const { file }: Props = $props();
  const expanded = $derived(airflac.expandedFileId === file.id);
</script>

<article class="card">
  <div class="top">
    <button
      type="button"
      class="expander"
      aria-expanded={expanded}
      aria-controls="card-details-{file.id}"
      onclick={() => airflac.toggleExpanded(file.id)}
    >
      <span class="chevron" class:open={expanded} aria-hidden="true">›</span>
      <span class="name">{file.filename}</span>
    </button>

    {#if file.tech && !file.tech.lossless}
      <span class="badge lossy">lossy</span>
    {/if}
  </div>

  <dl class="facts mono">
    <div><dt>Format</dt><dd>{file.tech?.codecLabel ?? '—'}</dd></div>
    <div><dt>Rate</dt><dd>{formatSampleRate(file.tech?.sampleRate)}</dd></div>
    <div><dt>Depth</dt><dd>{formatBitDepth(file.tech?.bitDepth)}</dd></div>
    <div><dt>Channels</dt><dd>{formatChannels(file.tech?.channels)}</dd></div>
    <div><dt>Duration</dt><dd>{formatDuration(file.tech?.durationSec)}</dd></div>
    <div>
      <dt>Size</dt>
      <dd>
        {formatBytes(file.originalSize)}
        {#if file.status === 'complete' && file.convertedSize !== null}
          → {formatBytes(file.convertedSize)}
        {/if}
      </dd>
    </div>
  </dl>

  <div class="foot">
    <div class="status">
      <span class="status-label" data-status={file.status}>{STATUS_LABELS[file.status]}</span>
      {#if sizeSummary(file)}
        <span class="delta" class:grew={sizeGrew(file)}>{sizeSummary(file)}</span>
      {/if}
      {#if IN_PROGRESS_STATUSES.has(file.status)}
        <ProgressBar percent={file.progress} label="Converting {file.filename}" />
      {/if}
    </div>

    {#if file.status === 'complete'}
      <a class="download" href={downloadFileUrl(file.id)} download>Download</a>
    {/if}
  </div>

  {#if file.error}
    <p class="error">{file.error}</p>
  {/if}

  {#if expanded}
    <div id="card-details-{file.id}">
      <FileDetails {file} />
    </div>
  {/if}
</article>

<style>
  .card {
    border-bottom: 1px solid var(--border);
  }

  .card:last-child {
    border-bottom: none;
  }

  .top {
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding: 12px 14px 0;
  }

  .expander {
    display: inline-flex;
    align-items: baseline;
    gap: 7px;
    background: none;
    border: none;
    padding: 0;
    text-align: left;
    color: var(--text);
    font-weight: 600;
    min-width: 0;
  }

  .chevron {
    color: var(--text-muted);
    transition: transform 0.12s ease;
  }

  .chevron.open {
    transform: rotate(90deg);
  }

  .name {
    overflow-wrap: anywhere;
  }

  .badge.lossy {
    padding: 1px 6px;
    font-size: 0.68rem;
    border-radius: 2px;
    color: var(--warning);
    border: 1px solid color-mix(in srgb, var(--warning) 40%, transparent);
    flex-shrink: 0;
  }

  .facts {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(96px, 1fr));
    gap: 6px 12px;
    margin: 10px 0 0;
    padding: 0 14px;
    font-size: 0.78rem;
  }

  dt {
    color: var(--text-muted);
    font-size: 0.68rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  dd {
    margin: 0;
    overflow-wrap: anywhere;
  }

  .foot {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 14px 12px;
  }

  .status {
    min-width: 0;
    flex: 1;
  }

  .status-label[data-status='complete'] {
    color: var(--accent);
  }

  .status-label[data-status='failed'] {
    color: var(--danger);
  }

  .delta {
    margin-left: 8px;
    font-size: 0.75rem;
    color: var(--accent);
  }

  .delta.grew {
    color: var(--warning);
  }

  .download {
    color: var(--accent);
    text-decoration: none;
    white-space: nowrap;
  }

  .error {
    margin: 0 14px 12px;
    font-size: 0.78rem;
    color: var(--danger);
  }
</style>
