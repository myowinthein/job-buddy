import type { Profile } from '@/src/types/profile';
import { DEV_PROFILE } from '@/src/utils/devProfile';

export function profilePreset(id: 'empty' | 'required' | 'complete'): Partial<Profile> {
  const profile = structuredClone(DEV_PROFILE);
  profile.id = 'dev-preview-sample';
  if (id === 'empty') return { id: profile.id };
  if (id === 'required')
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
  return profile;
}
