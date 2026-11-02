import type { Profile } from './profile';

export interface LearnedMappingEntry {
  path: string;
  count: number;
  // Best-available human-readable label (label/ariaLabel/placeholder/name) captured
  // at write time, for display in the Learned Mappings UI. The signal key itself is
  // normalized (lowercased, punctuation/spaces stripped) and unreadable on its own.
  // Absent on entries written before this field existed.
  label?: string;
  /** Full question context, separate from the shortened display label. */
  question?: string;
  /** Generic repeated fields follow their row; explicit editor choices keep an entry. */
  scope?: 'field' | 'entry';
}

export interface LearningContext {
  profileId: string;
  revision: string | null;
}

export interface LearnedObservation {
  signals: string[];
  path: string;
  label?: string;
  question?: string;
  scope?: 'field' | 'entry';
  context: LearningContext;
}

// A mapping value is either the legacy plain-string format (trusted as-is,
// written by older versions) or the new counted-entry format.
export type LearnedMappingValue = string | LearnedMappingEntry;

export interface LearnedMappings {
  [domain: string]: { [signal: string]: LearnedMappingValue };
}

// ── Google Drive Cloud Backup ────────────────────────────────────────────────

export type DriveError =
  | 'token_expired'
  | 'storage_full'
  | 'sync_error'
  | 'review_required'
  | 'invalid_backup'
  | 'delete_failed'
  | null;

export interface DriveBackupState {
  fileId: string | null;
  lastSynced: string | null;
  pendingSync: boolean;
  error: DriveError;
  /** Uploads stay paused until the existing backup has been reviewed. */
  reviewRequired?: boolean;
  reviewId?: string;
  remoteHash?: string;
  tokenExpiresAt?: number;
  accountEmail?: string;
  oauthClientId?: string;
  retryCount?: number;
  retryAt?: number;
  /** Short-lived activity marker; expires if the uploading context stops. */
  uploadingUntil?: number;
}

export interface DriveBackupFile {
  profile: Profile;
  learnedMappings?: LearnedMappings;
  lastModified: string;
}

export interface StorageSchema {
  profile: Profile;
  learnedMappings: LearnedMappings;
  driveToken?: string;
  driveBackupState?: DriveBackupState;
  themePreference?: 'system' | 'light' | 'dark';
}
