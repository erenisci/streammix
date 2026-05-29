<script lang="ts">
  import type { TrackInfo } from "@streammix/shared";
  import { categoryIcon, categoryLabel } from "./categoryDisplay.js";

  export let tracks: TrackInfo[] = [];
  export let gains: Record<string, number> = {};
  export let muted: Record<string, boolean> = {};
  export let broadcastGain: number = 0.2;
  export let offsetMs: number = 0;
  export let onChange: (slug: string, value: number) => void = () => {};
  export let onMuteToggle: (slug: string) => void = () => {};
  export let onSoloToggle: (slug: string) => void = () => {};
  export let onBroadcastChange: (value: number) => void = () => {};
  export let onOffsetChange: (ms: number) => void = () => {};
  export let onReset: () => void = () => {};
  export let onSaveStreamer: () => void = () => {};

  let showSettings = false;

  function handleSliderInput(slug: string, e: Event): void {
    const target = e.currentTarget as HTMLInputElement;
    onChange(slug, Number(target.value) / 100);
  }

  function handleBroadcastInput(e: Event): void {
    const target = e.currentTarget as HTMLInputElement;
    onBroadcastChange(Number(target.value) / 100);
  }

  function handleOffsetInput(e: Event): void {
    const target = e.currentTarget as HTMLInputElement;
    onOffsetChange(Number(target.value));
  }
</script>

<div class="mixer">
  <header>
    <span>🎚 Mixer</span>
    <button class="icon" title="Settings" on:click={() => (showSettings = !showSettings)}>⚙</button>
  </header>

  {#each tracks as t (t.id)}
    <div class="row">
      <button
        class="track-icon"
        title={muted[t.slug] ? "Unmute" : "Mute (Shift+click to solo)"}
        on:click={(e) => (e.shiftKey ? onSoloToggle(t.slug) : onMuteToggle(t.slug))}
      >
        {categoryIcon(t.category)}
      </button>
      <span class="label">{t.label || categoryLabel(t.category)}</span>
      <input
        type="range"
        min="0"
        max="100"
        value={Math.round((gains[t.slug] ?? 0.5) * 100)}
        on:input={(e) => handleSliderInput(t.slug, e)}
        class:muted={muted[t.slug]}
      />
      <span class="value">{Math.round((gains[t.slug] ?? 0.5) * 100)}</span>
    </div>
  {/each}

  <hr />

  <div class="row">
    <span class="track-icon">📺</span>
    <span class="label">Broadcast (residual)</span>
    <input
      type="range"
      min="0"
      max="100"
      value={Math.round(broadcastGain * 100)}
      on:input={handleBroadcastInput}
    />
    <span class="value">{Math.round(broadcastGain * 100)}</span>
  </div>

  {#if showSettings}
    <hr />
    <div class="settings">
      <label class="row">
        <span class="track-icon">⏱</span>
        <span class="label">Sync offset (ms)</span>
        <input
          type="range"
          min="0"
          max="2000"
          step="10"
          value={offsetMs}
          on:input={handleOffsetInput}
        />
        <span class="value">{offsetMs}</span>
      </label>
      <p class="hint">Side-channels are delayed by this much before cancellation. Raise it if the streamer's audio still leaks through.</p>
    </div>
  {/if}

  <footer>
    <button on:click={onReset}>Reset</button>
    <button on:click={onSaveStreamer}>Save for this streamer</button>
  </footer>
</div>

<style>
  .mixer {
    width: 320px;
    background: #1f1f23;
    color: #efeff1;
    padding: 12px;
    border-radius: 8px;
    font: 13px/1.4 system-ui, sans-serif;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  }
  header,
  footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  hr {
    border: 0;
    border-top: 1px solid #3a3a3d;
    margin: 8px 0;
  }
  .row {
    display: grid;
    grid-template-columns: 24px 1fr 110px 32px;
    align-items: center;
    gap: 8px;
    padding: 4px 0;
  }
  .track-icon {
    background: none;
    border: 0;
    color: inherit;
    font-size: 16px;
    cursor: pointer;
  }
  .label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  input[type="range"] {
    width: 100%;
  }
  input.muted {
    opacity: 0.4;
  }
  .value {
    text-align: right;
    font-variant-numeric: tabular-nums;
    color: #b3b3b6;
  }
  .settings {
    padding: 4px 0;
  }
  .hint {
    margin: 4px 0 0;
    color: #8b8b8e;
    font-size: 11px;
  }
  footer button {
    background: #3a3a3d;
    color: #efeff1;
    border: 0;
    padding: 6px 10px;
    border-radius: 4px;
    cursor: pointer;
  }
  footer button:hover {
    background: #4a4a4d;
  }
  .icon {
    background: none;
    border: 0;
    color: inherit;
    cursor: pointer;
    font-size: 16px;
  }
</style>
