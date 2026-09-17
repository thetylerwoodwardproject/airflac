<script lang="ts">
  import type { QueuedFile } from '@airflac/shared';

  import { artworkUrl } from '../lib/api.js';
  import { formatBytes } from '../lib/format.js';
  import type { FileEdits } from '../lib/stores/queue.svelte.js';

  interface Props {
    file: QueuedFile;
    edits: FileEdits;
    disabled: boolean;
    onReplace: (image: File) => void;
    onRemove: () => void;
    onRestore: () => void;
  }

  const { file, edits, disabled, onReplace, onRemove, onRestore }: Props = $props();

  const action = $derived(edits.artwork.action);
  const showingSourceArt = $derived(action === 'keep' && file.artwork !== null);
  const hasImage = $derived(showingSourceArt || action === 'replace');

  const source = $derived(
    action === 'replace' ? edits.previewUrl : showingSourceArt ? artworkUrl(file.id) : null,
  );

  function handleChange(event: Event) {
    const target = event.currentTarget as HTMLInputElement;
    const image = target.files?.[0];
    if (image) onReplace(image);
    target.value = '';
  }
</script>

<div class="artwork">
  <div class="preview" class:empty={!hasImage}>
    {#if source}
      <img src={source} alt="Album art for {file.filename}" />
    {:else}
      <span class="muted">No artwork</span>
    {/if}
  </div>

  <div class="controls">
    <label class="button-label" class:disabled>
      <input type="file" class="visually-hidden" accept="image/jpeg,image/png" {disabled} onchange={handleChange} />
      <span class="fake-button">{hasImage ? 'Replace' : 'Add Artwork'}</span>
    </label>

    {#if hasImage}
      <button type="button" class="quiet" {disabled} onclick={onRemove}>Remove</button>
    {/if}

    {#if action !== 'keep'}
      <button type="button" class="quiet" {disabled} onclick={onRestore}>Undo</button>
    {/if}

    {#if showingSourceArt && file.artwork}
      <p class="muted detail mono">
        {file.artwork.mimeType.replace('image/', '').toUpperCase()}
        {#if file.artwork.width && file.artwork.height}
          · {file.artwork.width}×{file.artwork.height}
        {/if}
        · {formatBytes(file.artwork.byteSize)}
      </p>
    {:else if action === 'remove'}
      <p class="muted detail">The FLAC will be written without album art.</p>
    {/if}
  </div>
</div>

<style>
  .artwork {
    display: flex;
    gap: 12px;
    align-items: flex-start;
  }

  .preview {
    width: 96px;
    height: 96px;
    flex-shrink: 0;
    display: grid;
    place-items: center;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
  }

  .preview.empty span {
    font-size: 0.75rem;
  }

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .controls {
    display: flex;
    flex-wrap: wrap;
    align-content: flex-start;
    gap: 8px;
  }

  .button-label {
    margin: 0;
  }

  .button-label:has(input:focus-visible) .fake-button {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .fake-button {
    display: inline-block;
    background: var(--panel-raised);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius);
    padding: 7px 14px;
    cursor: pointer;
    font-size: 0.9rem;
  }

  .button-label.disabled .fake-button {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .fake-button:hover {
    border-color: var(--accent-muted);
  }

  .detail {
    width: 100%;
    margin: 0;
    font-size: 0.75rem;
  }
</style>
