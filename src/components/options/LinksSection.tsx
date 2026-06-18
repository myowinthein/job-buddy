import { useState } from 'react';
import type { Profile, CustomLink } from '@/src/types/profile';
import { FormField } from './shared/FormField';
import { RemoveButton } from './shared/RemoveButton';

interface Props {
  profile: Partial<Profile>;
  onSave: (updates: Partial<Profile>) => Promise<void>;
}

const cls = (err?: string) =>
  err
    ? 'w-full px-3 py-2 border border-red-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500'
    : 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

export function LinksSection({ profile, onSave }: Props) {
  const l = profile.links;
  const [form, setForm] = useState({
    linkedin: l?.linkedin ?? '',
    github: l?.github ?? '',
    portfolio: l?.portfolio ?? '',
    twitter: l?.twitter ?? '',
    dribbble: l?.dribbble ?? '',
    behance: l?.behance ?? '',
  });
  const [custom, setCustom] = useState<CustomLink[]>(l?.custom ?? []);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const fieldError = (key: string, value: string): string => {
    if (key === 'linkedin') {
      if (!value.trim()) return 'LinkedIn URL is required';
      if (!value.includes('linkedin.com')) return 'Enter a valid LinkedIn URL';
    }
    return '';
  };

  const set = (key: string, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: fieldError(key, value) }));
  };

  const updateCustom = (idx: number, key: keyof CustomLink, value: string) => {
    setCustom((rows) => rows.map((r, i) => (i === idx ? { ...r, [key]: value } : r)));
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.linkedin.trim()) {
      e.linkedin = 'LinkedIn URL is required';
    } else if (!form.linkedin.includes('linkedin.com')) {
      e.linkedin = 'Enter a valid LinkedIn URL';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    await onSave({
      links: {
        linkedin: form.linkedin.trim(),
        github: form.github || undefined,
        portfolio: form.portfolio || undefined,
        twitter: form.twitter || undefined,
        dribbble: form.dribbble || undefined,
        behance: form.behance || undefined,
        custom: custom.filter((c) => c.label && c.url),
      },
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const PLATFORMS = [
    { key: 'linkedin', label: 'LinkedIn',     required: true,  placeholder: 'https://www.linkedin.com/in/johnsmith' },
    { key: 'github',   label: 'GitHub',       required: false, placeholder: 'https://github.com/johnsmith' },
    { key: 'portfolio',label: 'Portfolio',    required: false, placeholder: 'https://johnsmith.dev' },
    { key: 'twitter',  label: 'Twitter / X',  required: false, placeholder: 'https://x.com/johnsmith' },
    { key: 'dribbble', label: 'Dribbble',     required: false, placeholder: 'https://dribbble.com/johnsmith' },
    { key: 'behance',  label: 'Behance',      required: false, placeholder: 'https://www.behance.net/johnsmith' },
  ] as const;

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Links & Profiles</h2>
        <p className="text-sm text-gray-500 mt-1">Online presence used in job applications</p>
      </div>

      {PLATFORMS.map(({ key, label, required, placeholder }) => (
        <FormField key={key} label={label} required={required} error={errors[key]}>
          <input
            type="url"
            className={cls(errors[key])}
            value={form[key]}
            onChange={(e) => set(key, e.target.value)}
            placeholder={placeholder}
            maxLength={255}
          />
        </FormField>
      ))}

      {custom.length > 0 && (
        <div className="mb-4">
          <p className="text-sm font-medium text-gray-700 mb-2">Custom Links</p>
          {custom.map((c, idx) => (
            <div key={idx} className="flex gap-3 items-start mb-3">
              <div className="w-36">
                <FormField label="Label">
                  <input
                    className={cls()}
                    value={c.label}
                    onChange={(e) => updateCustom(idx, 'label', e.target.value)}
                    placeholder="My Blog"
                    maxLength={100}
                  />
                </FormField>
              </div>
              <div className="flex-1">
                <FormField label="URL">
                  <input
                    type="url"
                    className={cls()}
                    value={c.url}
                    onChange={(e) => updateCustom(idx, 'url', e.target.value)}
                    placeholder="https://blog.johnsmith.dev"
                    maxLength={255}
                  />
                </FormField>
              </div>
              <div className="mt-6">
                <RemoveButton onClick={() => setCustom((rows) => rows.filter((_, i) => i !== idx))} />
              </div>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => setCustom((rows) => [...rows, { label: '', url: '' }])}
        className="w-full py-2.5 border-2 border-dashed border-gray-300 text-sm text-gray-500 rounded-lg hover:border-blue-400 hover:text-blue-500 transition-colors mb-4"
      >
        + Add Custom Link
      </button>

      <div className="mt-2 pt-4 border-t border-gray-200 flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving...' : 'Save Links'}
        </button>
        {saved && <span className="text-sm text-green-600 font-medium">✓ Saved</span>}
      </div>
    </div>
  );
}
