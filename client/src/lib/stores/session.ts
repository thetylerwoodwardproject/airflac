const LOSSY_WARNING_KEY = 'airflac.lossyWarningShown';

/**
 * Remembers that the lossy-source warning has been shown.
 *
 * sessionStorage is unavailable in some privacy modes, so every access is
 * guarded: the worst case is the warning appearing once more than intended.
 */
export function hasSeenLossyWarning(): boolean {
  try {
    return sessionStorage.getItem(LOSSY_WARNING_KEY) === 'true';
  } catch {
    return false;
  }
}

export function markLossyWarningSeen(): void {
  try {
    sessionStorage.setItem(LOSSY_WARNING_KEY, 'true');
  } catch {
    // Nothing to do: the warning simply is not remembered for this session.
  }
}
