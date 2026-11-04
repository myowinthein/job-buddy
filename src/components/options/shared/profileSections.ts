import {
  UserRound,
  MapPin,
  IdCard,
  BriefcaseBusiness,
  GraduationCap,
  Languages,
  Link,
  Files,
  Wallet,
} from 'lucide-react';

import { PROFILE_SECTION_DEFINITIONS } from '@/src/profile/fieldCatalog';
export type { ProfileSectionId } from '@/src/profile/fieldCatalog';

const SECTION_ICONS = {
  personal: UserRound,
  address: MapPin,
  workAuthorization: IdCard,
  workHistory: BriefcaseBusiness,
  education: GraduationCap,
  languages: Languages,
  links: Link,
  documents: Files,
  salary: Wallet,
};

export const PROFILE_SECTIONS = PROFILE_SECTION_DEFINITIONS.map((section) => ({
  ...section,
  icon: SECTION_ICONS[section.id],
}));
