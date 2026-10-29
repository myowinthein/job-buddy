import { SectionHeader } from './shared/SectionHeader';
import { useSectionDraft } from './shared/useSectionDraft';
import { useToast } from '@/src/components/ui/useToast';
import { useState, useRef } from 'react';
import type { Profile, CustomLink } from '@/src/types/profile';
import { FormField } from './shared/FormField';
import { RemoveButton } from './shared/RemoveButton';
import { saveSection } from './shared/saveSection';
import { SaveButton } from './shared/SaveButton';
import { AddEntryButton } from './shared/AddEntryButton';
import { fieldCls as cls } from './shared/fieldCls';
import { useScrollToNewEntry } from './shared/useScrollToNewEntry';
import { withScheme } from '@/src/utils/url';
import { isLinkedInUrl, isValidProfileUrl } from '@/src/utils/profileInputValidation';

interface Props {
  profile: Partial<Profile>;
  onSave: (updates: Partial<Profile>) => Promise<void>;
}

export function LinksSection({ profile, onSave }: Props) {
  const l = profile.links;
  const [form, setForm] = useState({
    linkedin: l?.linkedin ?? '',
    portfolio: l?.portfolio ?? '',
    github: l?.github ?? '',
    twitter: l?.twitter ?? '',
    dribbble: l?.dribbble ?? '',
    behance: l?.behance ?? '',
  });
  const [custom, setCustom] = useState<CustomLink[]>(
    l?.custom?.length ? l.custom : [{ label: '', url: '' }],
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);

  const [newEntryTick, setNewEntryTick] = useState(0);
  const customContainerRef = useRef<HTMLDivElement>(null);
  useScrollToNewEntry(customContainerRef, newEntryTick);

  const isValidUrl = isValidProfileUrl;

  // Shared by updateCustom, handleCustomUrlBlur, and validate() — the one
  // check every custom-link URL field needs, regardless of when it fires.
  const customUrlError = (url: string, label = ''): string => {
    if (label.trim() && !url.trim()) return 'URL is required';
    return url.trim() && !isValidUrl(url.trim()) ? 'Enter a valid URL' : '';
  };

  const fieldError = (key: string, value: string): string => {
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
      [`custom.${idx}.label`]: next.url.trim() && !next.label.trim() ? 'Label is required' : '',
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
      'portfolio',
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
      if (c.url.trim() && !c.label.trim()) e[`custom.${idx}.label`] = 'Label is required';
      else if (c.label.length > 100) e[`custom.${idx}.label`] = 'Use 100 characters or fewer';
    });
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const saveDraft = useSectionDraft({ form, custom }, onSave);

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    await saveSection(
      saveDraft,
      {
        links: {
          linkedin: form.linkedin.trim() ? withScheme(form.linkedin.trim()) : '',
          portfolio: form.portfolio.trim() ? withScheme(form.portfolio.trim()) : undefined,
          custom: custom
            .filter((c) => c.label.trim() && c.url.trim())
            .map((c) => ({ ...c, url: withScheme(c.url.trim()) })),
          // Dedicated controls also retain compatibility with existing social-link paths
          github: form.github.trim() ? withScheme(form.github.trim()) : undefined,
          twitter: form.twitter.trim() ? withScheme(form.twitter.trim()) : undefined,
          dribbble: form.dribbble.trim() ? withScheme(form.dribbble.trim()) : undefined,
          behance: form.behance.trim() ? withScheme(form.behance.trim()) : undefined,
        },
      },
      showToast,
      'Links saved',
    );
    setSaving(false);
  };

  const PLATFORMS = [
    {
      key: 'linkedin',
      label: 'LinkedIn',
      required: false,
      placeholder: 'https://www.linkedin.com/in/johnsmith',
    },
    { key: 'portfolio', label: 'Portfolio', required: false, placeholder: 'https://johnsmith.dev' },
    { key: 'github', label: 'GitHub', required: false, placeholder: 'https://github.com/you' },
    { key: 'twitter', label: 'X / Twitter', required: false, placeholder: 'https://x.com/you' },
    {
      key: 'dribbble',
      label: 'Dribbble',
      required: false,
      placeholder: 'https://dribbble.com/you',
    },
    { key: 'behance', label: 'Behance', required: false, placeholder: 'https://behance.net/you' },
  ] as const;

  return (
    <div>
      <SectionHeader sectionId="links" />

      {PLATFORMS.map(({ key, label, required, placeholder }) => (
        <FormField key={key} label={label} required={required} error={errors[key]}>
          <input
            id={`field-${key}`}
            type="url"
            className={cls(errors[key])}
            value={form[key]}
            onChange={(e) => set(key, e.target.value)}
            onBlur={() => handleBlur(key)}
            placeholder={placeholder}
            maxLength={2048}
          />
        </FormField>
      ))}

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
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Custom Links</p>
          <AddEntryButton
            variant="pill"
            onClick={() => {
              setCustom((rows) => [...rows, { label: '', url: '' }]);
              setNewEntryTick((t) => t + 1);
            }}
            label="+ Add Entry"
          />
        </div>
        <div ref={customContainerRef}>
          {custom.map((c, idx) => (
            <div
              key={idx}
              className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg mb-3"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                  Entry {idx + 1}
                </span>
                <RemoveButton
                  onClick={() => setCustom((rows) => rows.filter((_, i) => i !== idx))}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FormField label="Label" error={errors[`custom.${idx}.label`]}>
                  <input
                    className={cls(errors[`custom.${idx}.label`])}
                    value={c.label}
                    onChange={(e) => updateCustom(idx, 'label', e.target.value)}
                    placeholder="My Blog"
                    list="custom-link-labels"
                    maxLength={100}
                  />
                </FormField>
                <FormField label="URL" error={errors[`custom.${idx}.url`]}>
                  <input
                    type="url"
                    className={cls(errors[`custom.${idx}.url`])}
                    value={c.url}
                    onChange={(e) => updateCustom(idx, 'url', e.target.value)}
                    onBlur={(e) => handleCustomUrlBlur(idx, e.target.value)}
                    placeholder="https://blog.johnsmith.dev"
                    maxLength={2048}
                  />
                </FormField>
              </div>
            </div>
          ))}
        </div>
        {/* customContainerRef */}
      </div>

      <div className="mt-2 pt-4 border-t border-gray-200 dark:border-gray-700 flex items-center gap-3">
        <SaveButton onClick={handleSave} saving={saving} label="Save Links" />
      </div>
    </div>
  );
}
