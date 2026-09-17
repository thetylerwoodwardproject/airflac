<script lang="ts">
  import { downloadJobUrl } from '../lib/api.js';
  import { airflac } from '../lib/stores/queue.svelte.js';

  const readyCount = $derived(airflac.readyFiles.length);
  const completedCount = $derived(airflac.completedFiles.length);
  const job = $derived(airflac.currentJob);

  const batchProgress = $derived(
    job && airflac.busy ? `Converting ${Math.min(airflac.convertedCount + 1, job.totalCount)} of ${job.totalCount}` : null,
  );
</script>

<div class="actions">
  <button
    type="button"
    class="primary"
    disabled={readyCount === 0 || airflac.busy || airflac.uploading}
    onclick={() => airflac.convert()}
  >
    Convert to FLAC{readyCount > 1 ? ` (${readyCount})` : ''}
  </button>

  {#if batchProgress}
    <span class="muted mono progress" aria-live="polite">{batchProgress}</span>
  {/if}

  <div class="spacer"></div>

  {#if completedCount > 1 && job}
    <a class="button-link" href={downloadJobUrl(job.id)} download>Download All ({completedCount})</a>
  {/if}

  <button
    type="button"
    class="quiet"
    disabled={airflac.files.length === 0 || airflac.busy}
    onclick={() => airflac.clear()}
  >
    Clear Queue
  </button>
</div>

<style>
  .actions {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }

  .spacer {
    flex: 1;
  }

  .progress {
    font-size: 0.85rem;
  }

  .button-link {
    display: inline-block;
    padding: 7px 14px;
    background: var(--panel-raised);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius);
    color: var(--text);
    text-decoration: none;
    font-size: 0.9rem;
  }

  .button-link:hover {
    border-color: var(--accent-muted);
    color: var(--accent);
  }
</style>
