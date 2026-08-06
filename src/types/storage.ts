import type { Profile } from './profile';

export interface LearnedMappingEntry {
  path:  string;
  count: number;
  // Best-available human-readable label (label/ariaLabel/placeholder/name) captured
  // at write time, for display in the Learned Mappings UI. The signal key itself is
  // normalized (lowercased, punctuation/spaces stripped) and unreadable on its own.
  // Absent on entries written before this field existed.
  label?: string;
}

// A mapping value is either the legacy plain-string format (trusted as-is,
// written by older versions) or the new counted-entry format.
export type LearnedMappingValue = string | LearnedMappingEntry;

export interface LearnedMappings {
  [domain: string]: { [signal: string]: LearnedMappingValue };
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
  profile:          Profile;
  learnedMappings?: LearnedMappings;
  lastModified:     string;
}

export interface StorageSchema {
  profile:            Profile;
  learnedMappings:    LearnedMappings;
  applicationHistory: ApplicationEntry[];
  driveToken?:        string;
  driveBackupState?:  DriveBackupState;
  themePreference?:   'system' | 'light' | 'dark';
}
