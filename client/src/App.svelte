<script lang="ts">
  import { onMount } from 'svelte';

  import { lossyCodecPhrase, type QueuedFile } from '@airflac/shared';

  import ActionsBar from './components/ActionsBar.svelte';
  import ConversionSettings from './components/ConversionSettings.svelte';
  import FileQueue from './components/FileQueue.svelte';
  import Header from './components/Header.svelte';
  import LossyWarningDialog from './components/LossyWarningDialog.svelte';
  import UploadDropzone from './components/UploadDropzone.svelte';
  import { fetchHealth } from './lib/api.js';
  import { hasSeenLossyWarning, markLossyWarningSeen } from './lib/stores/session.js';
  import { airflac } from './lib/stores/queue.svelte.js';

  let version = $state<string | null>(null);
  let dependenciesMissing = $state(false);
  let lossyPhrase = $state<string | null>(null);

  onMount(() => {
    void airflac.start();

    void fetchHealth()
      .then((health) => {
        version = health.version;
        dependenciesMissing = !health.ffmpeg || !health.ffprobe;
      })
      .catch(() => {
        // The header simply omits the version if health cannot be read.
      });

    return () => airflac.stop();
  });

  /**
   * Shows the lossy-source warning at most once per browser session, and once
   * per batch however many lossy files it holds.
   */
  function warnAboutLossySources(uploaded: QueuedFile[]): void {
    if (hasSeenLossyWarning()) return;

    const lossy = uploaded.find((file) => file.tech !== null && !file.tech.lossless);
    if (!lossy?.tech) return;

    lossyPhrase = lossyCodecPhrase(lossy.tech.codec);
    markLossyWarningSeen();
  }

  async function handleFiles(files: File[]): Promise<void> {
    const uploaded = await airflac.upload(files);
    warnAboutLossySources(uploaded);
  }
</script>

<main>
  <Header {version} connected={airflac.connected} />

  {#if dependenciesMissing}
    <p class="banner error" role="alert">
      FFmpeg or ffprobe was not found on the server. Audio cannot be inspected or converted until
      they are installed.
    </p>
  {/if}

  {#if airflac.error}
    <p class="banner error" role="alert">{airflac.error}</p>
  {/if}

  <UploadDropzone
    disabled={airflac.uploading}
    uploading={airflac.uploading}
    uploadPercent={airflac.uploadPercent}
    onFiles={handleFiles}
  />

  <ConversionSettings bind:settings={airflac.settings} disabled={airflac.busy} />

  {#if airflac.files.length > 0}
    <FileQueue />
    <ActionsBar />
  {:else}
    <p class="muted empty">
      Nothing queued. Drop WAV, FLAC, AIFF, MP3, AAC or any other file FFmpeg can read.
    </p>
  {/if}
</main>

<LossyWarningDialog codecPhrase={lossyPhrase} onDismiss={() => (lossyPhrase = null)} />

<style>
  main {
    max-width: 1180px;
    margin: 0 auto;
    padding: 32px 20px 60px;
    display: flex;
    flex-direction: column;
    gap: var(--gap);
  }

  .banner {
    margin: 0;
    padding: 10px 14px;
    border-radius: var(--radius);
    font-size: 0.88rem;
  }

  .banner.error {
    background: color-mix(in srgb, var(--danger) 12%, var(--panel));
    border: 1px solid color-mix(in srgb, var(--danger) 45%, transparent);
    color: var(--text);
  }

  .empty {
    margin: 4px 0 0;
    font-size: 0.88rem;
  }
</style>
