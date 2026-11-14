import type { DocumentFile, Profile } from '@/src/types/profile';
import { DEV_PROFILE } from '@/src/utils/devProfile';
import { sampleResumeText } from '@/src/testing/sampleResume';

function sampleDocument(name: string, lines: readonly string[]): DocumentFile {
  const pdf = sampleResumeText(lines);
  return { name, size: pdf.length, base64: `data:application/pdf;base64,${btoa(pdf)}` };
}

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
      documents: { cv: profile.documents.cv },
    };
  profile.education.unshift({
    institution: 'Georgia Institute of Technology',
    degree: 'M.Sc.',
    fieldOfStudy: 'Computer Science',
    startDate: '2025-01',
    isCurrent: true,
    grade: '3.9 GPA',
    description: 'Part-time study in software architecture and human-computer interaction.',
  });
  profile.links = {
    ...profile.links,
    twitter: 'https://x.com/janedoe_dev',
    dribbble: 'https://dribbble.com/janedoe',
    behance: 'https://behance.net/janedoe',
  };
  profile.documents.cv.file = sampleDocument('jane-doe-resume.pdf', [
    'Jane Doe - Senior Software Engineer',
    'jane.doe@example.com | Austin, Texas',
    'Experience',
    'Acme Corp - Senior Software Engineer | March 2021 - Present',
    'Beta Industries - Software Engineer | July 2018 - February 2021',
    'Education',
    'Georgia Institute of Technology - M.Sc. Computer Science | 2025 - Present',
    'University of Texas at Austin - B.Sc. Computer Science | 2014 - 2018',
    'Skills: TypeScript, React, frontend architecture, mentoring',
  ]);
  profile.documents.coverLetter = {
    url: 'https://example.com/jane-doe-cover-letter.pdf',
    file: sampleDocument('jane-doe-cover-letter.pdf', [
      'Jane Doe - Cover Letter',
      'Dear Hiring Team,',
      'I am interested in a senior software engineering role on your team.',
      'I build web applications and help teams improve frontend architecture.',
      'My experience includes TypeScript, React, developer tools and mentoring.',
      'I would welcome the opportunity to discuss how I can contribute.',
      'Kind regards,',
      'Jane Doe',
    ]),
  };
  profile.documents.portfolio = {
    ...profile.documents.portfolio,
    file: sampleDocument('jane-doe-portfolio.pdf', [
      'Jane Doe - Portfolio',
      'https://janedoe.dev',
      'Selected projects',
      'Dashboard redesign - React, TypeScript and accessible UI components',
      'Developer tools - Workflow automation and frontend architecture',
    ]),
  };
  profile.salary.expected.push({ amount: 125000, currency: 'EUR', period: 'annual' });
  return profile;
}
