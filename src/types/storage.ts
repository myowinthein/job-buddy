import type { Profile } from './profile';

export interface DetectedField {
  fieldPath:  string;
  value:      string;
  label:      string;
  confidence: 'high' | 'medium';
}

export interface TextChunk {
  id:   string;
  text: string;
  used: boolean;
}

export interface ExtractedResume {
  rawText:        string;
  detectedFields: DetectedField[];
  textChunks:     TextChunk[];
}

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
