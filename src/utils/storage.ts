import type { Profile } from '../types/profile';
import type { LearnedMappings, ApplicationEntry } from '../types/storage';

export async function getProfile(): Promise<Profile | null> {
  return new Promise((resolve) => {
    chrome.storage.local.get('profile', (result: Record<string, unknown>) => {
      resolve((result.profile as Profile) ?? null);
    });
  });
}

export async function saveProfile(profile: Profile): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ profile }, resolve);
  });
}

export async function getLearnedMappings(): Promise<LearnedMappings> {
  return new Promise((resolve) => {
    chrome.storage.local.get('learnedMappings', (result: Record<string, unknown>) => {
      resolve((result.learnedMappings as LearnedMappings) ?? {});
    });
  });
}

export async function saveLearmedMappings(mappings: LearnedMappings): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ learnedMappings: mappings }, resolve);
  });
}

export async function getApplicationHistory(): Promise<ApplicationEntry[]> {
  return new Promise((resolve) => {
    chrome.storage.local.get('applicationHistory', (result: Record<string, unknown>) => {
      resolve((result.applicationHistory as ApplicationEntry[]) ?? []);
    });
  });
}

export async function saveApplicationHistory(history: ApplicationEntry[]): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ applicationHistory: history }, resolve);
  });
}
