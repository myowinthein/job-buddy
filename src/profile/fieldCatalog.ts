import { profileFieldPolicy } from './fieldPolicies';
import type { Profile } from '../types/profile';

export const PROFILE_SECTION_DEFINITIONS = [
  { id: 'personal', label: 'Personal', description: 'Your name and contact details' },
  { id: 'address', label: 'Address', description: 'Your current address' },
  {
    id: 'workAuthorization',
    label: 'Work Authorization',
    description: 'Your right to work',
    entries: { scope: 'workAuthorization', path: 'workAuthorization', heading: 'country' },
  },
  { id: 'workHistory', label: 'Work History', description: 'Your experience and availability' },
  {
    id: 'education',
    label: 'Education',
    description: 'Your academic background',
    entries: { scope: 'education', path: 'education', heading: 'education' },
  },
  {
    id: 'languages',
    label: 'Languages',
    description: 'Your languages and proficiency',
    entries: { scope: 'languages', path: 'languages', heading: 'language' },
  },
  { id: 'links', label: 'Links', description: 'Your online profiles' },
  { id: 'documents', label: 'Documents', description: 'Your CV and cover letter' },
  { id: 'salary', label: 'Salary', description: 'Your gross base pay before tax' },
] as const;

export type ProfileSectionId = (typeof PROFILE_SECTION_DEFINITIONS)[number]['id'];

type LeafPaths<T> = T extends readonly (infer Entry)[]
  ? `$.${LeafPaths<NonNullable<Entry>>}`
  : T extends object
    ? {
        [Key in keyof T & string]: NonNullable<T[Key]> extends object
          ? `${Key}.${LeafPaths<NonNullable<T[Key]>>}`
          : Key;
      }[keyof T & string]
    : never;
export type ProfileStoragePath = LeafPaths<Profile>;

interface PickerChoice {
  learnDisplay?: boolean;
  label?: string;
  path: string;
}
interface FieldOptions {
  learnDisplay?: boolean;
  required?: boolean;
  picker?: false | readonly PickerChoice[];
  cluster?: boolean;
  pickerLabelFrom?: string;
  activeLabel?: string;
  inputId?: string;
  maxLength?: number;
  reviewHeading?: boolean;
  inputLabel?: string;
  when?: { key: string; value: string };
}
export interface CatalogField extends FieldOptions {
  kind: 'field';
  key: string;
  label: string;
  paths: readonly ProfileStoragePath[];
  entries?: {
    scope: string;
    path: string;
    heading: 'work' | 'education' | 'language' | 'country' | 'salary' | 'link';
  };
}
export interface CatalogGroup {
  kind: 'group';
  key: string;
  className?: string;
  disclosure?: string;
  children: readonly CatalogNode[];
}
export type CatalogNode = CatalogField | CatalogGroup;

// Existing IDs remain stable for deep links and restored options-page requests.
export function storageInputId(path: string): string {
  const parts = path.split('.');
  if (parts[0] === 'personal') return `field-${parts[1]}`;
  if (parts[0] === 'address') return `field-${parts[1]}`;
  if (parts[0] === 'professional')
    return parts[1] === 'summary'
      ? 'field-summary'
      : parts[2] === 'value'
        ? 'field-noticeValue'
        : 'field-noticePeriod';
  if (parts[0] === 'documents') return `field-${parts[1]}`;
  if (parts[0] === 'links')
    return parts[1] === 'custom' ? `field-customLink-${parts[2]}-${parts[3]}` : `field-${parts[1]}`;
  if (parts[0] === 'salary')
    return parts[1] === 'current'
      ? `field-current${parts[2][0].toUpperCase()}${parts[2].slice(1)}`
      : `field-expected-${parts[2]}-${parts[3]}`;
  const key =
    parts[2] === 'location' ? (parts[3] === 'city' ? 'locationCity' : 'location') : parts[2];
  return `field-${parts[0]}-${parts[1]}-${key}`;
}

function field<const Key extends string, const Path extends ProfileStoragePath>(
  key: Key,
  label: string,
  path: Path,
  options: FieldOptions = {},
) {
  return {
    kind: 'field' as const,
    key,
    label,
    paths: [path] as readonly [Path],
    inputId: storageInputId(path),
    maxLength: profileFieldPolicy(path).maxLength,
    ...options,
  };
}
function compound<const Key extends string, const Paths extends readonly ProfileStoragePath[]>(
  key: Key,
  label: string,
  paths: Paths,
  options: FieldOptions,
) {
  return {
    kind: 'field' as const,
    key,
    label,
    paths,
    inputId: storageInputId(paths[0]),
    maxLength: profileFieldPolicy(paths[paths.length - 1]).maxLength,
    ...options,
  };
}
function slot<const Key extends string>(
  key: Key,
  label: string,
  entries?: CatalogField['entries'],
) {
  return {
    kind: 'field' as const,
    key,
    label,
    paths: [] as const,
    entries,
    picker: false as const,
  };
}
function group<const Key extends string, const Children extends readonly CatalogNode[]>(
  key: Key,
  children: Children,
  className?: string,
  disclosure?: string,
) {
  return { kind: 'group' as const, key, children, className, disclosure };
}
const twoColumns = 'grid grid-cols-1 sm:grid-cols-2 gap-4';

function salaryFields<const Prefix extends 'current' | 'expected.$'>(prefix: Prefix) {
  return [
    group(
      'amounts',
      [
        field('amount', 'Amount', `salary.${prefix}.amount`, {
          picker: [
            {
              label: prefix === 'current' ? 'Current Salary' : 'Expected Salary',
              path: `salary.${prefix}.formatted`,
              learnDisplay: true,
            },
            { path: `salary.${prefix}.amount` },
          ],
        }),
        field('currency', 'Currency', `salary.${prefix}.currency`),
        field('period', 'Period', `salary.${prefix}.period`),
      ],
      'grid grid-cols-1 sm:grid-cols-3 gap-x-4',
    ),
  ] as const;
}

// Order and grouping here drive both the editor layouts and mapping choices.
// Each editor supplies its control bindings through ProfileFields.
export const PROFILE_FIELD_LAYOUTS = {
  personal: [
    group(
      'name',
      [
        field('firstName', 'First Name', 'personal.firstName', {
          required: true,
          picker: [
            { label: 'Full Name', path: 'derived.fullName' },
            { path: 'personal.firstName' },
          ],
        }),
        field('lastName', 'Last Name', 'personal.lastName'),
        field('nickname', 'Preferred name', 'personal.nickname'),
      ],
      'grid grid-cols-1 md:grid-cols-3 gap-4',
    ),
    field('email', 'Email', 'personal.email', { required: true }),
    compound(
      'phone',
      'Phone',
      ['personal.phone.countryCode', 'personal.phone.callingCode', 'personal.phone.number'],
      {
        required: true,
        cluster: true,
        picker: [
          { label: 'Full Phone', path: 'personal.phone.full', learnDisplay: true },
          { label: 'Country Code', path: 'personal.phone.callingCode' },
          { label: 'Phone Number', path: 'personal.phone.number' },
        ],
      },
    ),
    group(
      'background',
      [
        field('dateOfBirth', 'Date of Birth', 'personal.dateOfBirth', {
          cluster: true,
          picker: [
            { path: 'personal.dateOfBirth' },
            { label: 'Day', path: 'personal.dateOfBirth.day' },
            { label: 'Month', path: 'personal.dateOfBirth.month' },
            { label: 'Year', path: 'personal.dateOfBirth.year' },
            { label: 'Age', path: 'derived.age' },
          ],
        }),
        group(
          'demographics',
          [
            field('gender', 'Gender', 'personal.gender'),
            field('ethnicity', 'Ethnicity', 'personal.ethnicity'),
          ],
          twoColumns,
        ),
        group(
          'backgroundStatus',
          [
            field('veteranStatus', 'Veteran Status', 'personal.veteranStatus'),
            field('disabilityStatus', 'Disability Status', 'personal.disabilityStatus'),
          ],
          twoColumns,
        ),
      ],
      'mt-5 rounded-lg border border-gray-200 dark:border-gray-700 p-4',
      'Background details',
    ),
  ],
  address: [
    group(
      'countryPostal',
      [
        field('country', 'Country', 'address.country', {
          required: true,
          picker: [{ path: 'address.countryName', learnDisplay: true }],
        }),
        field('postalCode', 'Postal Code', 'address.postalCode'),
      ],
      twoColumns,
    ),
    field('street', 'Street Address', 'address.street'),
    group(
      'locality',
      [
        field('city', 'City', 'address.city', { required: true }),
        field('state', 'State / Province', 'address.state'),
      ],
      twoColumns,
    ),
  ],
  workAuthorization: [
    group(
      'authorization',
      [
        field('country', 'Country', 'workAuthorization.$.country', {
          required: true,
          reviewHeading: true,
        }),
        field('status', 'Authorization Status', 'workAuthorization.$.status', {
          required: true,
          picker: [{ path: 'workAuthorization.$' }],
        }),
      ],
      twoColumns,
    ),
    group(
      'visa',
      [
        field('visaType', 'Visa type', 'workAuthorization.$.visaType', {
          when: { key: 'status', value: 'work_visa' },
        }),
        field('expiryDate', 'Visa expiry date', 'workAuthorization.$.expiryDate', {
          when: { key: 'status', value: 'work_visa' },
        }),
      ],
      twoColumns,
    ),
  ],
  workHistory: [
    field('summary', 'Career Summary', 'professional.summary'),
    slot('experience', 'Experience', { scope: 'workEntry', path: 'workHistory', heading: 'work' }),
    slot('totalExperience', 'Total Experience'),
    compound(
      'noticePeriod',
      'Notice Period',
      [
        'professional.noticePeriod.immediate',
        'professional.noticePeriod.value',
        'professional.noticePeriod.unit',
      ],
      {
        required: true,
        picker: [
          { path: 'professional.noticePeriod.formatted', learnDisplay: true },
          {
            label: 'Available Date',
            path: 'professional.noticePeriod.availableDate',
            learnDisplay: true,
          },
        ],
      },
    ),
  ],
  workEntry: [
    group(
      'position',
      [
        field('company', 'Company', 'workHistory.$.company', {
          required: true,
          reviewHeading: true,
        }),
        field('title', 'Job Title', 'workHistory.$.title', { required: true }),
      ],
      twoColumns,
    ),
    group(
      'location',
      [
        field('country', 'Country', 'workHistory.$.location.countryCode', {
          picker: [
            { label: 'Location', path: 'workHistory.$.location' },
            { path: 'workHistory.$.location.countryName' },
          ],
        }),
        field('city', 'City', 'workHistory.$.location.city'),
      ],
      twoColumns,
    ),
    field('arrangement', 'Work Arrangement', 'workHistory.$.arrangement'),
    group(
      'dates',
      [
        field('startDate', 'Start Date', 'workHistory.$.startDate', {
          required: true,
          picker: [{ path: 'workHistory.$.startDate.formatted', learnDisplay: true }],
        }),
        field('endDate', 'End Date', 'workHistory.$.endDate', {
          picker: [{ path: 'workHistory.$.endDate.formatted', learnDisplay: true }],
        }),
      ],
      twoColumns,
    ),
    field('isCurrent', 'I currently work here', 'workHistory.$.isCurrent'),
    field('description', 'Description', 'workHistory.$.description'),
  ],
  education: [
    field('institution', 'Institution', 'education.$.institution', {
      required: true,
      reviewHeading: true,
    }),
    group(
      'qualification',
      [
        field('degree', 'Degree', 'education.$.degree', { required: true }),
        field('fieldOfStudy', 'Field of Study', 'education.$.fieldOfStudy', { required: true }),
      ],
      twoColumns,
    ),
    group(
      'dates',
      [
        field('startDate', 'Start Date', 'education.$.startDate', {
          required: true,
          picker: [{ path: 'education.$.startDate.formatted', learnDisplay: true }],
        }),
        field('endDate', 'End Date', 'education.$.endDate', {
          activeLabel: 'Expected graduation date',
          picker: [{ path: 'education.$.endDate.formatted', learnDisplay: true }],
        }),
      ],
      twoColumns,
    ),
    field('isCurrent', 'I’m currently studying here', 'education.$.isCurrent'),
    group(
      'coursework',
      [
        field('grade', 'Grade / GPA', 'education.$.grade'),
        field('description', 'Description', 'education.$.description'),
      ],
      'mb-4',
      'Grade and coursework',
    ),
  ],
  languages: [
    group(
      'language',
      [
        field('language', 'Language', 'languages.$.language', {
          required: true,
          reviewHeading: true,
          learnDisplay: true,
        }),
        field('proficiency', 'Proficiency', 'languages.$.proficiency', {
          required: true,
          learnDisplay: true,
        }),
      ],
      'grid grid-cols-1 sm:grid-cols-2 gap-3',
    ),
  ],
  links: [
    field('linkedin', 'LinkedIn', 'links.linkedin'),
    field('portfolio', 'Portfolio', 'links.portfolio'),
    field('github', 'GitHub', 'links.github'),
    field('twitter', 'X / Twitter', 'links.twitter'),
    field('dribbble', 'Dribbble', 'links.dribbble'),
    field('behance', 'Behance', 'links.behance'),
    slot('custom', 'Custom Links', { scope: 'customLink', path: 'links.custom', heading: 'link' }),
  ],
  customLink: [
    group(
      'link',
      [
        field('label', 'Label', 'links.custom.$.label', { picker: false }),
        field('url', 'URL', 'links.custom.$.url', { pickerLabelFrom: 'label' }),
      ],
      'grid grid-cols-1 sm:grid-cols-2 gap-3',
    ),
  ],
  documents: [
    field('cv', 'CV / Résumé', 'documents.cv.url', { cluster: true, inputLabel: 'Document URL' }),
    field('coverLetter', 'Cover letter', 'documents.coverLetter.url', {
      cluster: true,
      inputLabel: 'Document URL',
    }),
  ],
  salary: [
    slot('expected', 'Expected Salary', {
      scope: 'expectedSalary',
      path: 'salary.expected',
      heading: 'salary',
    }),
    slot('current', 'Current Salary', {
      scope: 'currentSalary',
      path: 'salary.current',
      heading: 'salary',
    }),
  ],
  currentSalary: salaryFields('current'),
  expectedSalary: salaryFields('expected.$'),
} as const satisfies Record<string, readonly CatalogNode[]>;

export type ProfileFieldScope = keyof typeof PROFILE_FIELD_LAYOUTS;
type FieldsIn<Node> = Node extends { kind: 'field' }
  ? Node
  : Node extends { children: readonly (infer Child)[] }
    ? FieldsIn<Child>
    : never;
export type FieldsFor<Scope extends ProfileFieldScope> = FieldsIn<
  (typeof PROFILE_FIELD_LAYOUTS)[Scope][number]
>;
export type ProfileFieldKey<Scope extends ProfileFieldScope> = FieldsFor<Scope>['key'];

type RegisteredPaths = FieldsFor<ProfileFieldScope>['paths'][number];
// Stored metadata and legacy context have no editable input of their own.
export const PROFILE_NON_EDITOR_PATHS = [
  'id',
  'salary.current.country',
  'salary.expected.$.country',
  'documents.cv.file.name',
  'documents.cv.file.size',
  'documents.cv.file.base64',
  'documents.coverLetter.file.name',
  'documents.coverLetter.file.size',
  'documents.coverLetter.file.base64',
  'derived.fullName',
  'derived.currentTitle',
  'derived.currentCompany',
  'derived.age',
  'derived.totalExperience.totalMonths',
  'derived.totalExperience.years',
  'derived.totalExperience.months',
  'derived.totalExperience.label',
] as const satisfies readonly ProfileStoragePath[];
type RequireCoverage<Missing extends never> = Missing;
export type ProfileFieldCoverage = RequireCoverage<
  Exclude<ProfileStoragePath, RegisteredPaths | (typeof PROFILE_NON_EDITOR_PATHS)[number]>
>;

export function catalogFields(nodes: readonly CatalogNode[]): CatalogField[] {
  return nodes.flatMap((node) => (node.kind === 'field' ? [node] : catalogFields(node.children)));
}

// Compatibility aliases are executable paths without a dedicated editor control.
const COMPATIBILITY_MAPPING_CHOICES: readonly PickerChoice[] = [
  { path: 'workAuthorization' },
  { path: 'languages.formatted', learnDisplay: true },
  { path: 'salary.expected.formatted' },
  { path: 'salary.current.country' },
  { path: 'salary.expected.$.country' },
  { path: 'documents.cv.file' },
  { path: 'derived.currentTitle' },
  { path: 'derived.currentCompany' },
  { path: 'derived.totalExperience.years' },
  { path: 'derived.totalExperience.months' },
  { path: 'derived.totalExperience.totalMonths' },
  { path: 'derived.totalExperience.label' },
];
const mappingChoices: readonly PickerChoice[] = [
  ...Object.values(PROFILE_FIELD_LAYOUTS).flatMap((nodes) =>
    catalogFields(nodes).flatMap((field) =>
      field.picker === false
        ? []
        : [
            ...field.paths.map((path) => ({ path, learnDisplay: field.learnDisplay })),
            ...(field.picker ?? []),
          ],
    ),
  ),
  ...COMPATIBILITY_MAPPING_CHOICES,
];
export const PROFILE_MAPPING_PATH_TEMPLATES = [
  ...new Set(mappingChoices.map((choice) => choice.path)),
];
// Learning compares raw values plus this explicit set of supported display values.
export const PROFILE_LEARNING_PATH_TEMPLATES = [
  ...new Set(mappingChoices.filter((choice) => choice.learnDisplay).map((choice) => choice.path)),
];

export const PROFILE_STORAGE_PATHS = [
  ...new Set<ProfileStoragePath>([
    ...Object.values(PROFILE_FIELD_LAYOUTS).flatMap((nodes) =>
      catalogFields(nodes).flatMap((field) => field.paths),
    ),
    ...PROFILE_NON_EDITOR_PATHS,
  ]),
];

type CollectionPath<Path> = Path extends `${infer Collection}.$.${string}` ? Collection : never;
export type ProfileCollectionPath = CollectionPath<ProfileStoragePath>;
export const PROFILE_ENTRY_PATHS = [
  ...new Set(
    PROFILE_STORAGE_PATHS.filter((path) => path.includes('.$.')).map(
      (path) => path.split('.$')[0] as ProfileCollectionPath,
    ),
  ),
];
