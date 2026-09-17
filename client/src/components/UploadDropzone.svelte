<script lang="ts">
  interface Props {
    disabled: boolean;
    uploading: boolean;
    uploadPercent: number | null;
    onFiles: (files: File[]) => void;
  }

  const { disabled, uploading, uploadPercent, onFiles }: Props = $props();

  let dragActive = $state(false);
  let input: HTMLInputElement;

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    dragActive = false;
    if (disabled) return;

    const files = [...(event.dataTransfer?.files ?? [])];
    if (files.length > 0) onFiles(files);
  }

  function handleChange(event: Event) {
    const target = event.currentTarget as HTMLInputElement;
    const files = [...(target.files ?? [])];
    if (files.length > 0) onFiles(files);
    // Cleared so that picking the same file twice in a row still fires a change.
    target.value = '';
  }
</script>

<!--
  The label wraps a real file input, so clicking, tapping and keyboard activation
  all work without any custom key handling. Dragging is an enhancement on top.
-->
<label
  class="dropzone"
  class:drag-active={dragActive}
  class:disabled
  ondragover={(event) => {
    event.preventDefault();
    if (!disabled) dragActive = true;
  }}
  ondragleave={() => (dragActive = false)}
  ondrop={handleDrop}
>
  <input
    bind:this={input}
    class="visually-hidden"
    type="file"
    multiple
    {disabled}
    onchange={handleChange}
  />

  {#if uploading}
    <span class="headline">Uploading{uploadPercent === null ? '' : ` ${uploadPercent}%`}</span>
    <span class="muted sub">Files are inspected as soon as they arrive.</span>
  {:else}
    <span class="headline">Drop audio files here</span>
    <span class="muted sub">or click to browse</span>
  {/if}
</label>

<style>
  .dropzone {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    min-height: 120px;
    margin: 0;
    padding: 24px 16px;
    text-align: center;
    background: var(--panel);
    border: 1px dashed var(--border-strong);
    border-radius: var(--radius);
    cursor: pointer;
    transition: border-color 0.12s ease, background 0.12s ease;
  }

  .dropzone:hover:not(.disabled),
  .dropzone.drag-active {
    border-color: var(--accent);
    background: var(--panel-raised);
  }

  .dropzone.disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }

  /* The input is visually hidden, so its focus ring has to land on the label. */
  .dropzone:has(input:focus-visible) {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .headline {
    font-size: 1rem;
    font-weight: 600;
    color: var(--text);
  }

  .sub {
    font-size: 0.85rem;
  }
</style>
