<script lang="ts">
  interface Props {
    /** 0-100, or null when the real percentage is not known. */
    percent: number | null;
    label: string;
  }

  const { percent, label }: Props = $props();
</script>

{#if percent === null}
  <!-- No honest percentage is available, so the bar is indeterminate rather than invented. -->
  <div class="track indeterminate" role="progressbar" aria-label={label} aria-valuetext="in progress">
    <div class="pulse"></div>
  </div>
{:else}
  <div
    class="track"
    role="progressbar"
    aria-label={label}
    aria-valuenow={percent}
    aria-valuemin="0"
    aria-valuemax="100"
  >
    <div class="fill" style="width: {percent}%"></div>
  </div>
{/if}

<style>
  .track {
    position: relative;
    width: 100%;
    min-width: 60px;
    height: 4px;
    margin-top: 5px;
    background: var(--panel-raised);
    border-radius: 4px;
    overflow: hidden;
  }

  .fill {
    height: 100%;
    background: var(--accent);
    transition: width 0.2s ease;
  }

  .pulse {
    position: absolute;
    inset: 0 auto 0 0;
    width: 40%;
    background: var(--accent-muted);
    animation: slide 1.4s ease-in-out infinite;
  }

  @keyframes slide {
    0% {
      transform: translateX(-100%);
    }
    100% {
      transform: translateX(250%);
    }
  }
</style>
