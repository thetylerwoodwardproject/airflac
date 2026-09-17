<script lang="ts">
  import {
    BIT_DEPTH_CHOICES,
    MAX_COMPRESSION_LEVEL,
    MIN_COMPRESSION_LEVEL,
    SAMPLE_RATE_CHOICES,
    type BitDepthChoice,
    type ConversionSettings,
    type SampleRateChoice,
  } from '@airflac/shared';

  interface Props {
    settings: ConversionSettings;
    disabled: boolean;
  }

  let { settings = $bindable(), disabled }: Props = $props();

  const levels = Array.from(
    { length: MAX_COMPRESSION_LEVEL - MIN_COMPRESSION_LEVEL + 1 },
    (_, index) => MIN_COMPRESSION_LEVEL + index,
  );

  function sampleRateLabel(choice: SampleRateChoice): string {
    return choice === 'source' ? 'Preserve source' : `${choice / 1000} kHz`;
  }

  function bitDepthLabel(choice: BitDepthChoice): string {
    return choice === 'source' ? 'Preserve source' : `${choice}-bit`;
  }
</script>

<section class="panel settings" aria-label="Conversion settings">
  <div class="field">
    <label for="compression">Compression level</label>
    <select id="compression" bind:value={settings.compressionLevel} {disabled}>
      {#each levels as level (level)}
        <option value={level}>{level}</option>
      {/each}
    </select>
  </div>

  <div class="field">
    <label for="sample-rate">Sample rate</label>
    <select id="sample-rate" bind:value={settings.sampleRate} {disabled}>
      {#each SAMPLE_RATE_CHOICES as choice (choice)}
        <option value={choice}>{sampleRateLabel(choice)}</option>
      {/each}
    </select>
  </div>

  <div class="field">
    <label for="bit-depth">Bit depth</label>
    <select id="bit-depth" bind:value={settings.bitDepth} {disabled}>
      {#each BIT_DEPTH_CHOICES as choice (choice)}
        <option value={choice}>{bitDepthLabel(choice)}</option>
      {/each}
    </select>
  </div>

  <p class="muted note">
    Compression level affects encoding time and file size, not audio quality. Sample rate and bit
    depth are preserved unless you change them here; a lossy source has no bit depth of its own and
    is written at 16-bit.
  </p>
</section>

<style>
  .settings {
    display: grid;
    grid-template-columns: repeat(3, minmax(120px, 160px)) 1fr;
    align-items: start;
    gap: var(--gap);
    padding: 14px 16px;
  }

  .note {
    margin: 0;
    align-self: center;
    font-size: 0.8rem;
    max-width: 46ch;
  }

  @media (max-width: 720px) {
    .settings {
      grid-template-columns: repeat(2, 1fr);
    }

    .note {
      grid-column: 1 / -1;
    }
  }
</style>
