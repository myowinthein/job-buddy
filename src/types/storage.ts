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

export interface StorageSchema {
  profile: Profile;
  learnedMappings: LearnedMappings;
  applicationHistory: ApplicationEntry[];
}
