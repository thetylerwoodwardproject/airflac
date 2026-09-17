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
      <span class="mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
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

  /* A small CSS-drawn mark rather than an image or icon library, in keeping
     with the rest of the interface: four bars standing in for a peak meter,
     tilted like a needle mid-swing. One bar carries the accent as the mark's
     single point of color. */
  .mark {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 28px;
    margin-right: 12px;
    transform: rotate(-8deg);
  }

  .mark i {
    width: 5px;
    border-radius: 5px;
    background: var(--text);
  }

  .mark i:nth-child(1) {
    height: 13px;
  }

  .mark i:nth-child(2) {
    height: 26px;
    background: var(--accent);
  }

  .mark i:nth-child(3) {
    height: 20px;
  }

  .mark i:nth-child(4) {
    height: 10px;
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
