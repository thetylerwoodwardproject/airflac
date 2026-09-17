/**
 * An error whose message is safe to show in the browser.
 *
 * Anything thrown that is not a UserFacingError is reported to the client as a
 * generic failure; the real cause is logged server-side only.
 */
export class UserFacingError extends Error {
  readonly status: number;
  readonly detail: string | undefined;

  constructor(message: string, status = 400, detail?: string) {
    super(message);
    this.name = 'UserFacingError';
    this.status = status;
    this.detail = detail;
  }
}

export const ERROR_MESSAGES = {
  unreadableMedia: 'FFmpeg could not read this file.',
  noAudioStream: 'This file does not contain a supported audio stream.',
  conversionFailed: 'Conversion failed. Check the AirFLAC server logs for details.',
  tooLarge: 'The uploaded file exceeds the configured size limit.',
  artworkTooLarge: 'The album art image exceeds the configured size limit.',
  artworkType: 'Album art must be a JPEG or PNG image.',
  notFound: 'That file is no longer available. It may have been cleared or expired.',
  noFiles: 'No files were uploaded.',
  serverShuttingDown: 'AirFLAC is shutting down and is not accepting new work.',
  unexpected: 'Something went wrong. Check the AirFLAC server logs for details.',
} as const;
