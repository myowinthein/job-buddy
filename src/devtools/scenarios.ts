import type { Profile } from '@/src/types/profile';
import { DEV_PROFILE } from '@/src/utils/devProfile';

export type DevSection = 'profile' | 'resume' | 'ai' | 'drive' | 'diagnostics';
export interface Scenario {
  id: string;
  section: DevSection;
  label: string;
  description: string;
  page: 'personal' | 'resume' | 'settings' | 'devTools';
  action?: 'resume' | 'check-key' | 'connect-drive' | 'back-up';
}
export const SCENARIOS: Scenario[] = [
  {
    id: 'workspace',
    section: 'profile',
    label: 'Simulation workspace',
    description: 'Explore the editor using temporary sample data.',
    page: 'devTools',
  },
  {
    id: 'profile-empty',
    section: 'profile',
    label: 'Empty profile',
    description: 'Start with no profile details and check the completion workflow.',
    page: 'personal',
  },
  {
    id: 'profile-minimum',
    section: 'profile',
    label: 'Required details only',
    description: 'Required checks pass while extra details remain empty.',
    page: 'personal',
  },
  {
    id: 'profile-complete',
    section: 'profile',
    label: 'Complete profile',
    description: 'Use a populated sample profile across all sections.',
    page: 'personal',
  },
  {
    id: 'profile-edge',
    section: 'profile',
    label: 'Long and international values',
    description: 'Check long names, Unicode text, multiple entries, and narrow layouts.',
    page: 'personal',
  },
  {
    id: 'resume-success',
    section: 'resume',
    label: 'New profile details',
    description: 'Analyze a sample resume and review new values.',
    page: 'resume',
    action: 'resume',
  },
  {
    id: 'resume-not-resume',
    section: 'resume',
    label: 'Not a resume',
    description: 'Stop an unrelated document before import review.',
    page: 'resume',
    action: 'resume',
  },
  {
    id: 'resume-uncertain',
    section: 'resume',
    label: 'Uncertain document',
    description: 'Confirm review or choose another file when the document purpose is unclear.',
    page: 'resume',
    action: 'resume',
  },
  {
    id: 'resume-identical',
    section: 'resume',
    label: 'Identical data and file',
    description: 'The sample extraction and saved resume match exactly.',
    page: 'resume',
    action: 'resume',
  },
  {
    id: 'resume-conflicts',
    section: 'resume',
    label: 'Changed profile details',
    description: 'Review changed contact details and work history.',
    page: 'resume',
    action: 'resume',
  },
  {
    id: 'resume-missing',
    section: 'resume',
    label: 'Missing dates and entries',
    description: 'Verify that known dates and entries omitted by the resume are retained.',
    page: 'resume',
    action: 'resume',
  },
  {
    id: 'resume-malformed',
    section: 'resume',
    label: 'Malformed AI response',
    description: 'Reject an invalid extraction before it reaches the review.',
    page: 'resume',
    action: 'resume',
  },
  {
    id: 'resume-cancel',
    section: 'resume',
    label: 'Slow analysis and cancellation',
    description: 'Analysis lasts 12 seconds so cancellation can be tested.',
    page: 'resume',
    action: 'resume',
  },
  {
    id: 'resume-save-failure',
    section: 'resume',
    label: 'Profile save failure',
    description: 'Extraction succeeds, but accepting changes reports a storage error.',
    page: 'resume',
    action: 'resume',
  },
  {
    id: 'ai-no-key',
    section: 'ai',
    label: 'No API key',
    description: 'Open resume import without a configured key.',
    page: 'resume',
  },
  {
    id: 'ai-checking',
    section: 'ai',
    label: 'Checking a key',
    description: 'Watch a slow key check finish successfully.',
    page: 'settings',
    action: 'check-key',
  },
  {
    id: 'ai-ready',
    section: 'ai',
    label: 'Key ready',
    description: 'Inspect a verified sample key and change its model.',
    page: 'settings',
  },
  {
    id: 'ai-invalid',
    section: 'ai',
    label: 'Invalid key',
    description: 'A key check reports an invalid credential.',
    page: 'settings',
    action: 'check-key',
  },
  {
    id: 'ai-quota',
    section: 'ai',
    label: 'Rate limit and fallback',
    description: 'The selected model returns 429; the next model completes extraction.',
    page: 'resume',
    action: 'resume',
  },
  {
    id: 'ai-timeout',
    section: 'ai',
    label: 'Timeout and fallback',
    description: 'The selected model stalls for the actual 30-second timeout, then falls back.',
    page: 'resume',
    action: 'resume',
  },
  {
    id: 'ai-unavailable',
    section: 'ai',
    label: 'Unavailable model',
    description: 'The selected model returns 503; the next model completes extraction.',
    page: 'resume',
    action: 'resume',
  },
  {
    id: 'drive-disconnected',
    section: 'drive',
    label: 'Disconnected',
    description: 'Inspect the initial connection stage.',
    page: 'settings',
  },
  {
    id: 'drive-empty',
    section: 'drive',
    label: 'Connect to an empty backup',
    description: 'Connect and create the first backup in the simulated Drive.',
    page: 'settings',
    action: 'connect-drive',
  },
  {
    id: 'drive-identical',
    section: 'drive',
    label: 'Connect to identical data',
    description: 'Connect when the existing backup matches the saved profile.',
    page: 'settings',
    action: 'connect-drive',
  },
  {
    id: 'drive-different',
    section: 'drive',
    label: 'Connect to different data',
    description: 'Open the shared import review for a different backup.',
    page: 'settings',
    action: 'connect-drive',
  },
  {
    id: 'drive-syncing',
    section: 'drive',
    label: 'Backup in progress',
    description: 'Run an upload that takes 10 seconds.',
    page: 'settings',
    action: 'back-up',
  },
  {
    id: 'drive-pending',
    section: 'drive',
    label: 'Backup pending',
    description: 'Inspect the pending-backup indicator and run a manual backup.',
    page: 'settings',
  },
  {
    id: 'drive-reconnect',
    section: 'drive',
    label: 'Reconnect needed',
    description: 'Inspect an expired connection and retry reconnecting.',
    page: 'settings',
  },
  {
    id: 'drive-failure',
    section: 'drive',
    label: 'Backup failure and retry',
    description: 'A simulated server failure schedules the normal background retry.',
    page: 'settings',
    action: 'back-up',
  },
];

export function scenarioById(id: string | null): Scenario | undefined {
  return SCENARIOS.find((scenario) => scenario.id === id);
}

export function profilePreset(id: string): Partial<Profile> {
  const profile = structuredClone(DEV_PROFILE);
  profile.id = 'dev-tools-sample';
  if (id === 'profile-empty' || id === 'resume-success') return { id: profile.id };
  if (id === 'profile-minimum')
    return {
      id: profile.id,
      personal: {
        firstName: profile.personal.firstName,
        lastName: '',
        email: profile.personal.email,
        phone: profile.personal.phone,
      },
      address: { city: profile.address.city, country: profile.address.country },
      professional: { noticePeriod: profile.professional.noticePeriod },
      workAuthorization: [profile.workAuthorization[0]],
      education: profile.education.map(
        ({ institution, degree, fieldOfStudy, startDate, endDate, isCurrent }) => ({
          institution,
          degree,
          fieldOfStudy,
          startDate,
          endDate,
          isCurrent,
        }),
      ),
      languages: [profile.languages[0]],
      documents: profile.documents,
    };
  if (id === 'profile-edge') {
    profile.personal.firstName = 'Alexandria María Nguyễn';
    profile.personal.lastName = 'Thein-Wong Fernández';
    profile.address.street =
      'Building 18, Apartment 1204, International Technology and Research District';
    profile.workHistory = [
      ...profile.workHistory,
      ...profile.workHistory.map((entry) => ({
        ...entry,
        company: `${entry.company} International Research and Development Division`,
      })),
    ];
  }
  return profile;
}

// A small valid PDF keeps the normal file/link extraction pipeline involved.
export function sampleResumeText(): string {
  const stream = 'BT /F1 18 Tf 50 740 Td (Jane Doe - Senior Engineer) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('');
  return `${pdf}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
}
