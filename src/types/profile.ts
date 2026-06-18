export interface PhoneNumber {
  countryCode: string;  // ISO 3166-1 alpha-2, e.g. "TH"
  callingCode: string;  // e.g. "+66"
  number: string;       // digits only, e.g. "812345678"
}

export type NoticePeriodUnit = 'day' | 'week' | 'month';
export type WorkAuthorizationStatus = 'citizen_or_pr' | 'work_visa' | 'requires_sponsorship';
export type LanguageProficiency =
  | 'native_bilingual'
  | 'full_professional'
  | 'professional_working'
  | 'limited_working'
  | 'elementary';
export type WorkArrangement = 'onsite' | 'remote' | 'hybrid';

export interface WorkLocation {
  countryCode?: string;
  city?: string;
}

export interface NoticePeriod {
  immediate: boolean;
  value?: number;
  unit?: NoticePeriodUnit;
}

export interface CurrentSalary {
  amount: number;
  currency: string;
}

export interface ExpectedSalaryEntry {
  country?: string;
  amount?: number;
  currency?: string;
}

export interface WorkAuthorizationEntry {
  country: string;
  status: WorkAuthorizationStatus;
  visaType?: string;
  expiryDate?: string;
}

export interface WorkHistoryEntry {
  company: string;
  title: string;
  startDate: string;
  isCurrent: boolean;
  endDate?: string;
  location?: WorkLocation;
  arrangement?: WorkArrangement;
  description?: string;
}

export interface EducationEntry {
  institution: string;
  degree: string;
  fieldOfStudy: string;
  startDate: string;
  isCurrent?: boolean;
  endDate?: string;
  grade?: string;
  description?: string;
}

export interface LanguageEntry {
  language: string;
  proficiency: LanguageProficiency;
}

export interface CustomLink {
  label: string;
  url: string;
}

export interface DocumentFile {
  name: string;
  size: number;
  base64: string;
}

export interface DocumentEntry {
  url?: string;
  file?: DocumentFile;
}

export interface Profile {
  personal: {
    firstName: string;
    lastName: string;
    email: string;
    phone: PhoneNumber;
    dateOfBirth?: string;
    gender?: string;
    ethnicity?: string;
    veteranStatus?: string;
    disabilityStatus?: string;
  };
  address: {
    city: string;
    country: string;
    street?: string;
    state?: string;
    postalCode?: string;
  };
  professional: {
    summary?: string;
    noticePeriod?: NoticePeriod;
  };
  salary: {
    current: CurrentSalary;
    expected: ExpectedSalaryEntry[];
  };
  workAuthorization: WorkAuthorizationEntry[];
  workHistory: WorkHistoryEntry[];
  education: EducationEntry[];
  languages: LanguageEntry[];
  links: {
    linkedin: string;
    portfolio?: string;
    custom?: CustomLink[];
    // Retained for backward compat with old profiles; no longer shown in UI
    github?: string;
    twitter?: string;
    dribbble?: string;
    behance?: string;
  };
  documents: {
    cv: DocumentEntry;
    coverLetter?: DocumentEntry;
  };
}
