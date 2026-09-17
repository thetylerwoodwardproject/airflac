import {
  DEFAULT_SETTINGS,
  TERMINAL_STATUSES,
  type ArtworkAction,
  type ConversionJob,
  type ConversionSettings,
  type Metadata,
  type QueuedFile,
  type ServerEvent,
} from '@airflac/shared';

import {
  clearQueue as clearQueueRequest,
  connectEvents,
  fetchQueue,
  requestConversion,
  uploadArtwork,
  uploadFiles,
} from '../api.js';

export interface FileEdits {
  metadata: Metadata;
  artwork: ArtworkAction;
  /** Object URL for a replacement image the user picked, shown before conversion. */
  previewUrl: string | null;
}

const IN_FLIGHT_STATUSES = new Set(['uploading', 'inspecting', 'waiting', 'converting', 'finalizing']);

class AirflacState {
  files = $state<QueuedFile[]>([]);
  jobs = $state<ConversionJob[]>([]);
  settings = $state<ConversionSettings>({ ...DEFAULT_SETTINGS });
  edits = $state<Record<string, FileEdits>>({});

  connected = $state(false);
  uploading = $state(false);
  uploadPercent = $state<number | null>(null);
  error = $state<string | null>(null);
  expandedFileId = $state<string | null>(null);

  readyFiles = $derived(this.files.filter((file) => file.status === 'ready'));
  completedFiles = $derived(this.files.filter((file) => file.status === 'complete'));
  failedFiles = $derived(this.files.filter((file) => file.status === 'failed'));
  busy = $derived(this.files.some((file) => IN_FLIGHT_STATUSES.has(file.status)));

  /** The batch currently being converted, or the most recent one. */
  currentJob = $derived(this.jobs.length > 0 ? this.jobs[this.jobs.length - 1] : undefined);

  convertedCount = $derived(
    this.currentJob
      ? this.currentJob.fileIds.filter((id) =>
          TERMINAL_STATUSES.has(this.files.find((file) => file.id === id)?.status ?? ''),
        ).length
      : 0,
  );

  private disconnect: (() => void) | null = null;

  async start(): Promise<void> {
    try {
      const snapshot = await fetchQueue();
      this.files = snapshot.files;
      this.jobs = snapshot.jobs;
      for (const file of snapshot.files) this.ensureEdits(file);
    } catch {
      // The event stream sends a full snapshot on connect, so this is not fatal.
    }

    this.disconnect = connectEvents(
      (event) => this.apply(event),
      (connected) => {
        this.connected = connected;
      },
    );
  }

  stop(): void {
    this.disconnect?.();
    this.disconnect = null;
  }

  private apply(event: ServerEvent): void {
    switch (event.type) {
      case 'snapshot':
        this.files = event.files;
        this.jobs = event.jobs;
        for (const file of event.files) this.ensureEdits(file);
        break;

      case 'file:update': {
        this.ensureEdits(event.file);
        const index = this.files.findIndex((file) => file.id === event.file.id);
        if (index === -1) this.files = [...this.files, event.file];
        else this.files[index] = event.file;
        break;
      }

      case 'file:remove':
        this.files = this.files.filter((file) => file.id !== event.fileId);
        this.releaseEdits(event.fileId);
        break;

      case 'job:update': {
        const index = this.jobs.findIndex((job) => job.id === event.job.id);
        if (index === -1) this.jobs = [...this.jobs, event.job];
        else this.jobs[index] = event.job;
        break;
      }

      case 'queue:cleared':
        this.files = [];
        this.jobs = [];
        this.releaseAllEdits();
        break;
    }
  }

  /**
   * Creates the working copy of a file's metadata, seeded from what was read out
   * of the file. Existing edits are never overwritten, so a server update
   * arriving mid-typing does not discard what the user has entered.
   */
  private ensureEdits(file: QueuedFile): void {
    if (this.edits[file.id]) return;
    this.edits[file.id] = {
      metadata: { ...file.metadata },
      artwork: { action: 'keep' },
      previewUrl: null,
    };
  }

  /**
   * Reads a file's working edits.
   *
   * This is called during rendering, so it only reads: the entry is seeded when
   * the file arrives from the server, never here.
   */
  editsFor(file: QueuedFile): FileEdits {
    return (
      this.edits[file.id] ?? {
        metadata: { ...file.metadata },
        artwork: { action: 'keep' },
        previewUrl: null,
      }
    );
  }

  updateMetadata(fileId: string, field: keyof Metadata, value: string): void {
    const edits = this.edits[fileId];
    if (!edits) return;
    edits.metadata = { ...edits.metadata, [field]: value };
  }

  async replaceArtwork(fileId: string, file: File): Promise<void> {
    const edits = this.edits[fileId];
    if (!edits) return;

    try {
      const response = await uploadArtwork(file);
      if (edits.previewUrl) URL.revokeObjectURL(edits.previewUrl);
      edits.previewUrl = URL.createObjectURL(file);
      edits.artwork = { action: 'replace', artworkId: response.artworkId };
      this.error = null;
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'That image could not be used.';
    }
  }

  removeArtwork(fileId: string): void {
    const edits = this.edits[fileId];
    if (!edits) return;
    if (edits.previewUrl) URL.revokeObjectURL(edits.previewUrl);
    edits.previewUrl = null;
    edits.artwork = { action: 'remove' };
  }

  restoreArtwork(fileId: string): void {
    const edits = this.edits[fileId];
    if (!edits) return;
    if (edits.previewUrl) URL.revokeObjectURL(edits.previewUrl);
    edits.previewUrl = null;
    edits.artwork = { action: 'keep' };
  }

  private releaseEdits(fileId: string): void {
    const edits = this.edits[fileId];
    if (edits?.previewUrl) URL.revokeObjectURL(edits.previewUrl);
    delete this.edits[fileId];
  }

  private releaseAllEdits(): void {
    for (const fileId of Object.keys(this.edits)) this.releaseEdits(fileId);
    this.edits = {};
  }

  async upload(files: File[]): Promise<QueuedFile[]> {
    if (files.length === 0) return [];

    this.uploading = true;
    this.uploadPercent = 0;
    this.error = null;

    try {
      const response = await uploadFiles(files, (percent) => {
        this.uploadPercent = percent;
      });
      return response.files;
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Upload failed.';
      return [];
    } finally {
      this.uploading = false;
      this.uploadPercent = null;
    }
  }

  async convert(): Promise<void> {
    const targets = this.readyFiles;
    if (targets.length === 0) return;

    this.error = null;

    try {
      await requestConversion({
        settings: { ...this.settings },
        files: targets.map((file) => {
          const edits = this.editsFor(file);
          return { fileId: file.id, metadata: edits.metadata, artwork: edits.artwork };
        }),
      });
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Conversion could not be started.';
    }
  }

  async clear(): Promise<void> {
    this.error = null;
    try {
      await clearQueueRequest();
      this.expandedFileId = null;
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'The queue could not be cleared.';
    }
  }

  toggleExpanded(fileId: string): void {
    this.expandedFileId = this.expandedFileId === fileId ? null : fileId;
  }
}

export const airflac = new AirflacState();
