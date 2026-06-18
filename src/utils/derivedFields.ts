import type { Profile, DerivedFields } from '../types/profile';
import { calculateExperience } from './experience';

function calculateAge(dob: string): number | undefined {
  const parts = dob.split('-');
  if (parts.length !== 3) return undefined;
  const year  = parseInt(parts[0] ?? '', 10);
  const month = parseInt(parts[1] ?? '', 10) - 1; // Date month is 0-indexed
  const day   = parseInt(parts[2] ?? '', 10);
  if (isNaN(year) || isNaN(month) || isNaN(day)) return undefined;

  const today = new Date();
  let age = today.getFullYear() - year;
  const m = today.getMonth() - month;
  if (m < 0 || (m === 0 && today.getDate() < day)) age--;
  return age >= 0 ? age : undefined;
}

export function calculateDerivedFields(profile: Profile): DerivedFields {
  // fullName
  const firstName = profile.personal?.firstName?.trim() ?? '';
  const lastName  = profile.personal?.lastName?.trim()  ?? '';
  const fullName  = [firstName, lastName].filter(Boolean).join(' ');

  // currentTitle / currentCompany — most recent isCurrent entry by startDate
  const currentEntries = (profile.workHistory ?? []).filter((e) => e.isCurrent);
  let currentTitle   = '';
  let currentCompany = '';
  if (currentEntries.length > 0) {
    const mostRecent = currentEntries.reduce((a, b) => (a.startDate >= b.startDate ? a : b));
    currentTitle   = mostRecent.title;
    currentCompany = mostRecent.company;
  }

  // totalExperience — reuse existing helper; normalise "no data" label to ''
  const exp = calculateExperience(profile.workHistory);
  const totalExperience: DerivedFields['totalExperience'] = {
    totalMonths: exp.totalMonths,
    years:       exp.years,
    months:      exp.months,
    label:       exp.totalMonths > 0 ? exp.label : '',
  };

  // age — omit if dateOfBirth is missing or unparseable
  const age = profile.personal?.dateOfBirth
    ? calculateAge(profile.personal.dateOfBirth)
    : undefined;

  const derived: DerivedFields = { fullName, currentTitle, currentCompany, totalExperience };
  if (age !== undefined) derived.age = age;
  return derived;
}
