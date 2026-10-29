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

export const PROFILE_SECTIONS = [
  {
    id: 'personal',
    label: 'Personal',
    description: 'Your name and contact details',
    icon: UserRound,
  },
  { id: 'address', label: 'Address', description: 'Your current address', icon: MapPin },
  {
    id: 'workAuthorization',
    label: 'Work Authorization',
    description: 'Your right to work',
    icon: IdCard,
  },
  {
    id: 'workHistory',
    label: 'Work History',
    description: 'Your experience and availability',
    icon: BriefcaseBusiness,
  },
  {
    id: 'education',
    label: 'Education',
    description: 'Your academic background',
    icon: GraduationCap,
  },
  {
    id: 'languages',
    label: 'Languages',
    description: 'Your languages and proficiency',
    icon: Languages,
  },
  { id: 'links', label: 'Links', description: 'Your online profiles', icon: Link },
  { id: 'documents', label: 'Documents', description: 'Your CV and cover letter', icon: Files },
  { id: 'salary', label: 'Salary', description: 'Your gross base pay before tax', icon: Wallet },
] as const;

export type ProfileSectionId = (typeof PROFILE_SECTIONS)[number]['id'];
