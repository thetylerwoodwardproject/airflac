<script lang="ts">
  interface Props {
    /** Codec phrase as it reads in the sentence, e.g. "An MP3" or "AAC". */
    codecPhrase: string | null;
    onDismiss: () => void;
  }

  const { codecPhrase, onDismiss }: Props = $props();

  let dialog = $state<HTMLDialogElement | null>(null);

  // <dialog>.showModal() brings focus trapping, Escape-to-close and background
  // inertness with it, so none of that needs reimplementing.
  $effect(() => {
    if (!dialog) return;
    if (codecPhrase && !dialog.open) dialog.showModal();
    else if (!codecPhrase && dialog.open) dialog.close();
  });
</script>

<dialog bind:this={dialog} onclose={onDismiss} aria-labelledby="lossy-title">
  {#if codecPhrase}
    <h2 id="lossy-title">Really? {codecPhrase}? For broadcast?</h2>
    <p class="muted">
      I'll convert it, but turning a lossy file into FLAC does not put the missing audio back.
    </p>
    <div class="actions">
      <button type="button" class="primary" onclick={() => dialog?.close()}>
        I know what I'm doing
      </button>
    </div>
  {/if}
</dialog>

<style>
  dialog {
    max-width: 460px;
    padding: 22px;
    color: var(--text);
    background: var(--panel);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius);
  }

  dialog::backdrop {
    background: rgb(0 0 0 / 0.55);
  }

  h2 {
    font-size: 1.05rem;
    margin-bottom: 8px;
  }

  p {
    margin: 0 0 18px;
    font-size: 0.9rem;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
  }
</style>
