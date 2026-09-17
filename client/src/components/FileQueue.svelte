<script lang="ts">
  import { onMount } from 'svelte';

  import { downloadFileUrl } from '../lib/api.js';
  import {
    formatBitDepth,
    formatBytes,
    formatChannels,
    formatDuration,
    formatSampleRate,
  } from '../lib/format.js';
  import { IN_PROGRESS_STATUSES, STATUS_LABELS, sizeGrew, sizeSummary } from '../lib/queueDisplay.js';
  import { isMetadataOnlyChange } from '@airflac/shared';

  import { airflac } from '../lib/stores/queue.svelte.js';
  import FileDetails from './FileDetails.svelte';
  import FileQueueCard from './FileQueueCard.svelte';
  import ProgressBar from './ProgressBar.svelte';

  const NARROW_QUERY = '(max-width: 760px)';

  let narrow = $state(false);

  // A table cannot stay readable on a phone without clipping the status and
  // download controls, so the same data is rendered as cards instead.
  onMount(() => {
    const query = window.matchMedia(NARROW_QUERY);
    const update = () => (narrow = query.matches);

    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  });
</script>

<div class="panel">
  {#if narrow}
    <div class="cards">
      {#each airflac.files as file (file.id)}
        <FileQueueCard {file} />
      {/each}
    </div>
  {:else}
    <table>
      <caption class="visually-hidden">Files queued for conversion</caption>
      <thead>
        <tr>
          <th scope="col">Filename</th>
          <th scope="col">Format</th>
          <th scope="col">Sample rate</th>
          <th scope="col">Bit depth</th>
          <th scope="col">Channels</th>
          <th scope="col">Duration</th>
          <th scope="col">Size</th>
          <th scope="col">Status</th>
          <th scope="col"><span class="visually-hidden">Actions</span></th>
        </tr>
      </thead>

      <tbody>
        {#each airflac.files as file (file.id)}
          {@const expanded = airflac.expandedFileId === file.id}
          <tr class:expanded>
            <td>
              <button
                type="button"
                class="expander"
                aria-expanded={expanded}
                aria-controls="details-{file.id}"
                onclick={() => airflac.toggleExpanded(file.id)}
              >
                <span class="chevron" class:open={expanded} aria-hidden="true">›</span>
                <span class="name">{file.filename}</span>
              </button>
              {#if file.tech && !file.tech.lossless}
                <span class="badge lossy" title="The source is a lossy format">lossy</span>
              {/if}
              {#if file.tech && file.status === 'ready' && isMetadataOnlyChange(airflac.settings, file.tech)}
                <span
                  class="badge"
                  title="Already FLAC: the tags are rewritten and the audio is copied untouched, so the compression level does not apply"
                >metadata only</span>
              {/if}
            </td>

            <td class="mono">{file.tech?.codecLabel ?? '—'}</td>
            <td class="mono">{formatSampleRate(file.tech?.sampleRate)}</td>
            <td class="mono">{formatBitDepth(file.tech?.bitDepth)}</td>
            <td class="mono">{formatChannels(file.tech?.channels)}</td>
            <td class="mono">{formatDuration(file.tech?.durationSec)}</td>

            <td class="mono size">
              {formatBytes(file.originalSize)}
              {#if file.status === 'complete' && file.convertedSize !== null}
                <span class="muted">→ {formatBytes(file.convertedSize)}</span>
                <span class="delta" class:grew={sizeGrew(file)}>{sizeSummary(file)}</span>
              {/if}
            </td>

            <td class="status">
              <span class="status-label" data-status={file.status}>{STATUS_LABELS[file.status]}</span>
              {#if IN_PROGRESS_STATUSES.has(file.status)}
                <ProgressBar percent={file.progress} label="Converting {file.filename}" />
              {/if}
              {#if file.error}
                <p class="error">{file.error}</p>
              {/if}
            </td>

            <td class="actions">
              {#if file.status === 'complete'}
                <a class="download" href={downloadFileUrl(file.id)} download>Download</a>
              {/if}
            </td>
          </tr>

          {#if expanded}
            <tr class="details-row">
              <td colspan="9" id="details-{file.id}">
                <FileDetails {file} />
              </td>
            </tr>
          {/if}
        {/each}
      </tbody>
    </table>
  {/if}
</div>

<style>
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.88rem;
  }

  th {
    text-align: left;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-muted);
    font-weight: 600;
    padding: 10px 12px;
    border-bottom: 1px solid var(--border);
    white-space: nowrap;
  }

  td {
    padding: 9px 12px;
    border-bottom: 1px solid var(--border);
    vertical-align: top;
  }

  tbody tr:last-child > td {
    border-bottom: none;
  }

  tr.expanded > td {
    border-bottom-color: transparent;
  }

  .details-row > td {
    padding: 0;
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
    font-size: 0.88rem;
  }

  .expander:hover .name {
    color: var(--accent);
  }

  .chevron {
    display: inline-block;
    color: var(--text-muted);
    transition: transform 0.12s ease;
  }

  .chevron.open {
    transform: rotate(90deg);
  }

  .name {
    overflow-wrap: anywhere;
  }

  .badge {
    display: inline-block;
    margin-left: 8px;
    padding: 1px 6px;
    font-size: 0.68rem;
    border-radius: 2px;
    border: 1px solid var(--border-strong);
    color: var(--text-muted);
  }

  .badge.lossy {
    color: var(--warning);
    border-color: color-mix(in srgb, var(--warning) 40%, transparent);
  }

  .size {
    white-space: nowrap;
  }

  .delta {
    display: block;
    font-size: 0.75rem;
    color: var(--accent);
  }

  .delta.grew {
    color: var(--warning);
  }

  .status {
    min-width: 130px;
  }

  .status-label {
    white-space: nowrap;
  }

  .status-label[data-status='complete'] {
    color: var(--accent);
  }

  .status-label[data-status='failed'] {
    color: var(--danger);
  }

  .error {
    margin: 4px 0 0;
    font-size: 0.75rem;
    color: var(--danger);
    max-width: 30ch;
  }

  .actions {
    text-align: right;
  }

  .download {
    color: var(--accent);
    text-decoration: none;
    white-space: nowrap;
  }

  .download:hover {
    text-decoration: underline;
  }
</style>
