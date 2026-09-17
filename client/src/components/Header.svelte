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
    <h1>{APP_NAME}</h1>
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
    font-size: 1.35rem;
  }

  .tagline {
    margin: 2px 0 0;
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
