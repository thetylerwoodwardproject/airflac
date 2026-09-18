<script lang="ts">
  import { APP_NAME, APP_TAGLINE } from '@airflac/shared';

  interface Props {
    version: string | null;
    connected: boolean;
  }

  const { version, connected }: Props = $props();
</script>

<header>
  <div class="titles">
    <h1>
      <svg class="mark" viewBox="0 0 576 512" fill="currentColor" aria-hidden="true">
        <path
          d="M96.5 0c-35.3 0-64 28.7-64 64l0 384c0 35.3 28.7 64 64 64l256 0c35.3 0 64-28.7 64-64l0-96 78.1 0-31 31c-9.4 9.4-9.4 24.6 0 33.9s24.6 9.4 33.9 0l72-72c9.4-9.4 9.4-24.6 0-33.9l-72-72c-9.4-9.4-24.6-9.4-33.9 0s-9.4 24.6 0 33.9l31 31-78.1 0 0-133.5c0-17-6.7-33.3-18.7-45.3L291.2 18.7C279.2 6.7 263 0 246 0L96.5 0zM358 176l-93.5 0c-13.3 0-24-10.7-24-24L240.5 58.5 358 176zM224.5 328c0-13.3 10.7-24 24-24l104 0 0 48-104 0c-13.3 0-24-10.7-24-24z"
        />
      </svg>
      {APP_NAME}
    </h1>
    <p class="muted tagline">{APP_TAGLINE}</p>
  </div>

  <div class="meta muted mono">
    {#if !connected}
      <span class="offline" title="Not receiving updates from the server">offline</span>
    {/if}
    {#if version}
      <span>v{version}</span>
    {/if}
  </div>
</header>

<style>
  header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--gap);
    flex-wrap: wrap;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--border);
  }

  h1 {
    display: flex;
    align-items: center;
    font-size: 2.1rem;
  }

  /* FontAwesome's "file-export" glyph, inlined from its published path data
     rather than pulled in as a runtime icon library -- one icon, no new
     dependency. Colored the same lime as the footer's hyperlink. */
  .mark {
    width: 0.72em;
    height: 0.72em;
    margin-right: 10px;
    color: var(--accent);
    flex-shrink: 0;
  }

  .tagline {
    margin: 4px 0 0;
    font-size: 0.85rem;
  }

  .meta {
    display: flex;
    align-items: baseline;
    gap: 10px;
    font-size: 0.8rem;
  }

  .offline {
    color: var(--warning);
  }
</style>
