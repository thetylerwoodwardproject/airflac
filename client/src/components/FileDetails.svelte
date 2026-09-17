<script lang="ts">
  import { isMetadataOnlyChange, type QueuedFile } from '@airflac/shared';

  import { airflac } from '../lib/stores/queue.svelte.js';
  import {
    describeStorage,
    formatBitrate,
    formatChannels,
    formatSampleRate,
  } from '../lib/format.js';
  import ArtworkPicker from './ArtworkPicker.svelte';

  interface Props {
    file: QueuedFile;
  }

  const { file }: Props = $props();

  const edits = $derived(airflac.editsFor(file));
  const editable = $derived(file.status === 'ready');
  const metadataOnly = $derived(
    file.tech !== null && isMetadataOnlyChange(airflac.settings, file.tech),
  );
</script>

<div class="details">
  <section aria-label="Technical details">
    <h3>Source</h3>
    <dl class="mono">
      <dt>Codec</dt>
      <dd>{file.tech?.codecLongName ?? '—'}</dd>

      <dt>Container</dt>
      <dd>{file.tech?.containerLongName ?? '—'}</dd>

      <dt>Sample format</dt>
      <dd>{file.tech?.sampleFormat ?? '—'}</dd>

      <dt>Channel layout</dt>
      <dd>{file.tech?.channelLayout ?? formatChannels(file.tech?.channels)}</dd>

      <dt>Bitrate</dt>
      <dd>{formatBitrate(file.tech?.bitrate)}</dd>

      <dt>Sample rate</dt>
      <dd>{formatSampleRate(file.tech?.sampleRate)}</dd>

      <dt>Compression</dt>
      <dd>{file.tech?.lossless ? 'Lossless' : 'Lossy'}</dd>

      <dt>Storage</dt>
      <dd>{describeStorage(file.originalSize, file.tech)}</dd>
    </dl>

    {#if metadataOnly && file.status === 'ready'}
      <p class="muted note">
        Already FLAC, so only the metadata will be rewritten and the audio is copied untouched — the
        compression level does not apply. There is little space left to reclaim from a file that is
        already compressed; choose a different sample rate or bit depth if you do want it re-encoded.
      </p>
    {/if}
  </section>

  <section aria-label="Metadata">
    <h3>Metadata</h3>

    <div class="fields">
      <div>
        <label for="title-{file.id}">Title</label>
        <input
          id="title-{file.id}"
          type="text"
          disabled={!editable}
          value={edits.metadata.title}
          oninput={(event) =>
            airflac.updateMetadata(file.id, 'title', event.currentTarget.value)}
        />
      </div>

      <div>
        <label for="artist-{file.id}">Artist</label>
        <input
          id="artist-{file.id}"
          type="text"
          disabled={!editable}
          value={edits.metadata.artist}
          oninput={(event) =>
            airflac.updateMetadata(file.id, 'artist', event.currentTarget.value)}
        />
      </div>

      <div>
        <label for="album-{file.id}">Album</label>
        <input
          id="album-{file.id}"
          type="text"
          disabled={!editable}
          value={edits.metadata.album}
          oninput={(event) =>
            airflac.updateMetadata(file.id, 'album', event.currentTarget.value)}
        />
      </div>
    </div>
  </section>

  <section aria-label="Album art">
    <h3>Album art</h3>
    <ArtworkPicker
      {file}
      {edits}
      disabled={!editable}
      onReplace={(image) => airflac.replaceArtwork(file.id, image)}
      onRemove={() => airflac.removeArtwork(file.id)}
      onRestore={() => airflac.restoreArtwork(file.id)}
    />
  </section>
</div>

<style>
  .details {
    display: grid;
    grid-template-columns: minmax(240px, 1fr) minmax(240px, 1fr) auto;
    gap: 24px;
    padding: 16px 18px 20px;
    background: var(--bg);
    border-top: 1px solid var(--border);
  }

  h3 {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-muted);
    margin-bottom: 10px;
  }

  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 4px 14px;
    margin: 0;
    font-size: 0.82rem;
  }

  dt {
    color: var(--text-muted);
  }

  dd {
    margin: 0;
    overflow-wrap: anywhere;
  }

  .fields {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .note {
    margin: 12px 0 0;
    font-size: 0.78rem;
    max-width: 42ch;
  }

  @media (max-width: 900px) {
    .details {
      grid-template-columns: 1fr;
      gap: 18px;
    }
  }
</style>
