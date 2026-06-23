import type { Profile } from './profile';

export interface LearnedMappings {
  [domain: string]: { [signal: string]: string };
}

export interface ApplicationEntry {
  id: string;
  jobTitle: string;
  company: string;
  url: string;
  appliedAt: string;
  status: 'applied' | 'duplicate_warned';
}

// ── Google Drive Cloud Backup ────────────────────────────────────────────────

export type DriveError = 'token_expired' | 'storage_full' | 'sync_error' | null;

export interface DriveBackupState {
  fileId:      string | null;
  lastSynced:  string | null;
  pendingSync: boolean;
  error:       DriveError;
}

export interface DriveBackupFile {
  profile:      Profile;
  lastModified: string;
}

export interface StorageSchema {
  profile:            Profile;
  learnedMappings:    LearnedMappings;
  applicationHistory: ApplicationEntry[];
  driveToken?:        string;
  driveBackupState?:  DriveBackupState;
}
