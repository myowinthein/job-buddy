import { feedback } from '@/src/ui/feedback';
import { profileTextLimit } from '@/src/profile/fieldPolicies';
import { ProfileFields } from './shared/ProfileFields';
import type { CatalogField } from '@/src/profile/fieldCatalog';
import { SectionHeader } from './shared/SectionHeader';
import { useSectionDraft } from './shared/useSectionDraft';
import { useToast } from '@/src/components/ui/useToast';
import { useState, useRef } from 'react';
import type { Profile, CustomLink } from '@/src/types/profile';
import { FormField } from './shared/FormField';
import { ConfirmRemoveButton } from './shared/ConfirmRemoveButton';
import { removeEntryErrors } from './shared/entryErrors';
import { saveSection } from './shared/saveSection';
import { SaveButton } from './shared/SaveButton';
import { EntryListHeader } from './shared/EntryListHeader';
import { fieldCls as cls } from './shared/fieldCls';
import { useScrollToNewEntry } from './shared/useScrollToNewEntry';
import { withScheme } from '@/src/utils/url';
import { isLinkedInUrl, isValidProfileUrl, profileUrlLengthError } from '@/src/utils/profileInputValidation';

interface Props {
  profile: Partial<Profile>;
  onSave: (updates: Partial<Profile>) => Promise<void>;
}

type LocalLink = CustomLink & { rowId: string };
const emptyLink = (): LocalLink => ({ rowId: crypto.randomUUID(), label: '', url: '' });

export function LinksSection({ profile, onSave }: Props) {
  const l = profile.links;
  const [form, setForm] = useState({
    linkedin: l?.linkedin ?? '',
    github: l?.github ?? '',
    twitter: l?.twitter ?? '',
    dribbble: l?.dribbble ?? '',
    behance: l?.behance ?? '',
  });
  const [custom, setCustom] = useState<LocalLink[]>(
    l?.custom?.length ? l.custom.map((link) => ({ ...link, rowId: crypto.randomUUID() })) : [emptyLink()],
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);

  const customContainerRef = useRef<HTMLDivElement>(null);
  const { focusEntry } = useScrollToNewEntry(customContainerRef);

  const isValidUrl = isValidProfileUrl;

  // Shared by updateCustom, handleCustomUrlBlur, and validate() — the one
  // check every custom-link URL field needs, regardless of when it fires.
  const customUrlError = (url: string, label = ''): string => {
    if (label.trim() && !url.trim()) return 'Enter a URL';
    const lengthError = profileUrlLengthError(url);
    if (lengthError) return lengthError;
    return url.trim() && !isValidUrl(url.trim()) ? 'Enter a valid URL' : '';
  };

  const fieldError = (key: string, value: string): string => {
    const lengthError = profileUrlLengthError(value);
    if (lengthError) return lengthError;
    if (key === 'linkedin') {
      if (!value.trim()) return '';
      if (!isLinkedInUrl(value)) return 'Enter a valid LinkedIn URL';
    }
    if (key !== 'linkedin' && value.trim() && !isValidUrl(value.trim())) return 'Enter a valid URL';
    return '';
  };

  const set = (key: string, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: fieldError(key, value) }));
  };

  const handleBlur = (key: string) => {
    setErrors((e) => ({
      ...e,
      [key]: fieldError(key, (form as Record<string, string>)[key] ?? ''),
    }));
  };

  const updateCustom = (idx: number, key: keyof CustomLink, value: string) => {
    setCustom((rows) => rows.map((r, i) => (i === idx ? { ...r, [key]: value } : r)));
    const next = { ...custom[idx], [key]: value };
    setErrors((e) => ({
      ...e,
      [`custom.${idx}.label`]: next.url.trim() && !next.label.trim() ? 'Enter a link label' : '',
      [`custom.${idx}.url`]: customUrlError(next.url, next.label),
    }));
  };

  const handleCustomUrlBlur = (idx: number, url: string) => {
    setErrors((e) => ({ ...e, [`custom.${idx}.url`]: customUrlError(url, custom[idx].label) }));
  };

  const validate = () => {
    const e: Record<string, string> = {};
    for (const key of [
      'linkedin',
      'github',
      'twitter',
      'dribbble',
      'behance',
    ] as const) {
      const err = fieldError(key, form[key]);
      if (err) e[key] = err;
    }
    custom.forEach((c, idx) => {
      const err = customUrlError(c.url, c.label);
      if (err) e[`custom.${idx}.url`] = err;
      if (c.url.trim() && !c.label.trim()) e[`custom.${idx}.label`] = 'Enter a link label';
      else if (c.label.length > profileTextLimit('links.custom.$.label'))
        e[`custom.${idx}.label`] =
          `Use ${profileTextLimit('links.custom.$.label')} characters or fewer`;
    });
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const saveDraft = useSectionDraft(
    { form, custom: custom.map(({ rowId: _rowId, ...row }) => row) },
    onSave,
  );

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    await saveSection(
      saveDraft,
      {
        links: {
          linkedin: form.linkedin.trim() ? withScheme(form.linkedin.trim()) : '',
          custom: custom
            .filter((c) => c.label.trim() && c.url.trim())
            .map((c) => ({ label: c.label, url: withScheme(c.url.trim()) })),
          // Dedicated controls also retain compatibility with existing social-link paths
          github: form.github.trim() ? withScheme(form.github.trim()) : undefined,
          twitter: form.twitter.trim() ? withScheme(form.twitter.trim()) : undefined,
          dribbble: form.dribbble.trim() ? withScheme(form.dribbble.trim()) : undefined,
          behance: form.behance.trim() ? withScheme(form.behance.trim()) : undefined,
        },
      },
      showToast,
      feedback.profileSaved,
    );
    setSaving(false);
  };

  const placeholders = {
    linkedin: 'https://www.linkedin.com/in/johnsmith',
    github: 'https://github.com/you',
    twitter: 'https://x.com/you',
    dribbble: 'https://dribbble.com/you',
    behance: 'https://behance.net/you',
  };
  const renderLink = (key: keyof typeof form, field: CatalogField) => (
    <FormField label={field.label} required={field.required} error={errors[key]}>
      <input
        id={field.inputId}
        type="url"
        className={cls(errors[key])}
        value={form[key]}
        onChange={(e) => set(key, e.target.value)}
        onBlur={() => handleBlur(key)}
        placeholder={placeholders[key]}

      />
    </FormField>
  );

  return (
    <div>
      <SectionHeader sectionId="links" />

      <ProfileFields
        scope="links"
        renderers={{
          linkedin: (field) => renderLink('linkedin', field),
          github: (field) => renderLink('github', field),
          twitter: (field) => renderLink('twitter', field),
          dribbble: (field) => renderLink('dribbble', field),
          behance: (field) => renderLink('behance', field),
          custom: (field) => (
            <>
              <datalist id="custom-link-labels">
                {[
                  'Blog',
                  'GitLab',
                  'Stack Overflow',
                  'YouTube',
                  'Personal website',
                  'Design portfolio',
                ].map((label) => (
                  <option key={label} value={label} />
                ))}
              </datalist>
              <div className="mb-4">
                <EntryListHeader
                  id="add-customLinks"
                  title={field.label}
                  onAdd={() => {
                    const existing = custom.find((row) => !row.label && !row.url);
                    const row = existing ?? emptyLink();
                    if (!existing) setCustom((rows) => [...rows, row]);
                    focusEntry(row.rowId);
                  }}
                  label="+ Add Entry"
                />
                <div ref={customContainerRef}>
                  {custom.map((c, idx) => (
                    <div
                      key={c.rowId}
                      data-entry-id={c.rowId}
                      className="profile-entry-fields @container/profile-entry relative p-4 border border-gray-200 dark:border-gray-700 rounded-lg mb-3"
                    >
                      <div className="absolute right-4 top-4">
                        <ConfirmRemoveButton
                          compact
                          confirm={!!(c.label || c.url)}
                          action={custom.length === 1 ? 'Clear' : 'Delete'}
                          onConfirm={() => {
                            setCustom((rows) =>
                              rows.length === 1 ? [emptyLink()] : rows.filter((_, i) => i !== idx),
                            );
                            setErrors((errors) => removeEntryErrors(errors, idx, 'custom.'));
                          }}
                        />
                      </div>
                      <ProfileFields
                        index={idx}
                        scope="customLink"
                        renderers={{
                          label: (field) => (
                            <FormField
                              label={field.label}
                              required={field.required}
                              error={errors[`custom.${idx}.label`]}
                            >
                              <input
                                id={field.inputId}
                                className={cls(errors[`custom.${idx}.label`])}
                                value={c.label}
                                onChange={(e) => updateCustom(idx, 'label', e.target.value)}
                                placeholder="My Blog"
                                list="custom-link-labels"

                              />
                            </FormField>
                          ),
                          url: (field) => (
                            <FormField
                              label={field.label}
                              required={field.required}
                              error={errors[`custom.${idx}.url`]}
                            >
                              <input
                                type="url"
                                id={field.inputId}
                                className={cls(errors[`custom.${idx}.url`])}
                                value={c.url}
                                onChange={(e) => updateCustom(idx, 'url', e.target.value)}
                                onBlur={(e) => handleCustomUrlBlur(idx, e.target.value)}
                                placeholder="https://blog.johnsmith.dev"

                              />
                            </FormField>
                          ),
                        }}
                      />
                    </div>
                  ))}
                </div>
                {/* customContainerRef */}
              </div>
            </>
          ),
        }}
      />
      <SaveButton onClick={handleSave} saving={saving} label="Save" />
    </div>
  );
}
