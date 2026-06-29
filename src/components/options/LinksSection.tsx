import { useToast } from '@/src/components/ui/useToast';
import { useState, useRef, useEffect } from 'react';
import type { Profile, CustomLink } from '@/src/types/profile';
import { FormField } from './shared/FormField';
import { RemoveButton } from './shared/RemoveButton';
import { saveSection } from './shared/saveSection';

interface Props {
  profile: Partial<Profile>;
  onSave: (updates: Partial<Profile>) => Promise<void>;
}

const cls = (err?: string) =>
  err
    ? 'w-full px-3 py-2 border border-red-300 dark:border-red-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500'
    : 'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

export function LinksSection({ profile, onSave }: Props) {
  const l = profile.links;
  const [form, setForm] = useState({
    linkedin:  l?.linkedin  ?? '',
    portfolio: l?.portfolio ?? '',
  });
  const [custom, setCustom] = useState<CustomLink[]>(l?.custom?.length ? l.custom : [{ label: '', url: '' }]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);

  const [newEntryTick, setNewEntryTick] = useState(0);
  const customContainerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!newEntryTick) return;
    const raf = requestAnimationFrame(() => {
      const last = customContainerRef.current?.lastElementChild as HTMLElement | null;
      last?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      last?.querySelector<HTMLElement>(
        'input:not([type="radio"]):not([type="checkbox"]):not([type="hidden"]):not([readonly]),' +
        ' select, button[aria-haspopup="listbox"]',
      )?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [newEntryTick]);

  const isValidUrl = (url: string): boolean => {
    const normalized = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    try { return new URL(normalized).hostname.includes('.'); } catch { return false; }
  };

  const fieldError = (key: string, value: string): string => {
    if (key === 'linkedin') {
      if (!value.trim()) return 'LinkedIn URL is required';
      if (!value.includes('linkedin.com')) return 'Enter a valid LinkedIn URL';
    }
    if (key === 'portfolio' && value.trim() && !isValidUrl(value.trim()))
      return 'Enter a valid URL';
    return '';
  };

  const set = (key: string, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: fieldError(key, value) }));
  };

  const handleBlur = (key: string) => {
    setErrors((e) => ({ ...e, [key]: fieldError(key, (form as Record<string, string>)[key] ?? '') }));
  };

  const updateCustom = (idx: number, key: keyof CustomLink, value: string) => {
    setCustom((rows) => rows.map((r, i) => (i === idx ? { ...r, [key]: value } : r)));
    if (key === 'url') {
      const err = value.trim() && !isValidUrl(value.trim()) ? 'Enter a valid URL' : '';
      setErrors((e) => ({ ...e, [`custom.${idx}.url`]: err }));
    }
  };

  const handleCustomUrlBlur = (idx: number, url: string) => {
    const err = url.trim() && !isValidUrl(url.trim()) ? 'Enter a valid URL' : '';
    setErrors((e) => ({ ...e, [`custom.${idx}.url`]: err }));
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.linkedin.trim()) {
      e.linkedin = 'LinkedIn URL is required';
    } else if (!form.linkedin.includes('linkedin.com')) {
      e.linkedin = 'Enter a valid LinkedIn URL';
    }
    if (form.portfolio.trim() && !isValidUrl(form.portfolio.trim()))
      e.portfolio = 'Enter a valid URL';
    custom.forEach((c, idx) => {
      if (c.url.trim() && !isValidUrl(c.url.trim()))
        e[`custom.${idx}.url`] = 'Enter a valid URL';
    });
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    await saveSection(onSave, {
      links: {
        linkedin:  form.linkedin.trim(),
        portfolio: form.portfolio || undefined,
        custom:    custom.filter((c) => c.label && c.url),
        // Preserve any IT-specific fields that may exist in older profiles
        github:   l?.github,
        twitter:  l?.twitter,
        dribbble: l?.dribbble,
        behance:  l?.behance,
      },
    }, showToast, 'Links saved');
    setSaving(false);
  };

  const PLATFORMS = [
    { key: 'linkedin',  label: 'LinkedIn',   required: true,  placeholder: 'https://www.linkedin.com/in/johnsmith' },
    { key: 'portfolio', label: 'Portfolio',   required: false, placeholder: 'https://johnsmith.dev' },
  ] as const;

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Links & Profiles</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Online presence used in job applications</p>
      </div>

      {PLATFORMS.map(({ key, label, required, placeholder }) => (
        <FormField key={key} label={label} required={required} error={errors[key]}>
          <input
            id={key === 'linkedin' ? 'field-linkedin' : key === 'portfolio' ? 'field-portfolio' : undefined}
            type="url"
            className={cls(errors[key])}
            value={form[key]}
            onChange={(e) => set(key, e.target.value)}
            onBlur={() => handleBlur(key)}
            placeholder={placeholder}
            maxLength={255}
          />
        </FormField>
      ))}

      <div className="mb-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Custom Links</p>
          <button
            type="button"
            onClick={() => { setCustom((rows) => [...rows, { label: '', url: '' }]); setNewEntryTick((t) => t + 1); }}
            className="text-xs px-3 py-1.5 border border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/30 active:scale-95 transition-colors"
          >
            + Add Entry
          </button>
        </div>
        <div ref={customContainerRef}>
        {custom.map((c, idx) => (
            <div key={idx} className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg mb-3">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Entry {idx + 1}</span>
                <RemoveButton onClick={() => setCustom((rows) => rows.filter((_, i) => i !== idx))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Label">
                  <input
                    className={cls()}
                    value={c.label}
                    onChange={(e) => updateCustom(idx, 'label', e.target.value)}
                    placeholder="My Blog"
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
                    maxLength={255}
                  />
                </FormField>
              </div>
            </div>
          ))}
        </div>{/* customContainerRef */}
      </div>

      <div className="mt-2 pt-4 border-t border-gray-200 dark:border-gray-700 flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 active:scale-95 transition-colors"
        >
          {saving ? 'Saving...' : 'Save Links'}
        </button>
      </div>
    </div>
  );
}
