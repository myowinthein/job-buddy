import { useState } from 'react';
import type { Profile, NoticePeriodUnit } from '@/src/types/profile';
import { FormField } from './shared/FormField';

interface Props {
  profile: Partial<Profile>;
  onSave: (updates: Partial<Profile>) => Promise<void>;
}

const cls = (err?: string) =>
  err
    ? 'w-full px-3 py-2 border border-red-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500'
    : 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

export function ProfessionalSection({ profile, onSave }: Props) {
  const p = profile.professional;
  const [form, setForm] = useState({
    currentTitle: p?.currentTitle ?? '',
    currentCompany: p?.currentCompany ?? '',
    yearsOfExperience: p?.yearsOfExperience?.toString() ?? '',
    summary: p?.summary ?? '',
    noticeImmediate: p?.noticePeriod?.immediate ?? true,
    noticeValue: p?.noticePeriod?.value?.toString() ?? '',
    noticeUnit: (p?.noticePeriod?.unit ?? 'week') as NoticePeriodUnit,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const set = (key: string, value: string | boolean) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (typeof value === 'string' && errors[key]) setErrors((e) => ({ ...e, [key]: '' }));
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.currentTitle.trim()) e.currentTitle = 'Current title is required';
    if (!form.currentCompany.trim()) e.currentCompany = 'Current company is required';
    if (form.yearsOfExperience === '') {
      e.yearsOfExperience = 'Years of experience is required';
    } else if (isNaN(Number(form.yearsOfExperience)) || Number(form.yearsOfExperience) < 0) {
      e.yearsOfExperience = 'Enter a valid number';
    }
    if (!form.noticeImmediate && !form.noticeValue.trim()) {
      e.noticeValue = 'Enter a notice period duration';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    await onSave({
      professional: {
        currentTitle: form.currentTitle.trim(),
        currentCompany: form.currentCompany.trim(),
        yearsOfExperience: Number(form.yearsOfExperience),
        summary: form.summary || undefined,
        noticePeriod: {
          immediate: form.noticeImmediate,
          value: form.noticeImmediate ? undefined : Number(form.noticeValue),
          unit: form.noticeImmediate ? undefined : form.noticeUnit,
        },
      },
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Professional Details</h2>
        <p className="text-sm text-gray-500 mt-1">Your current role and career summary</p>
      </div>

      <FormField label="Current Job Title" required error={errors.currentTitle}>
        <input
          className={cls(errors.currentTitle)}
          value={form.currentTitle}
          onChange={(e) => set('currentTitle', e.target.value)}
          placeholder="Senior Software Engineer"
        />
      </FormField>

      <FormField label="Current Company" required error={errors.currentCompany}>
        <input
          className={cls(errors.currentCompany)}
          value={form.currentCompany}
          onChange={(e) => set('currentCompany', e.target.value)}
          placeholder="Acme Corp"
        />
      </FormField>

      <FormField label="Years of Experience" required error={errors.yearsOfExperience}>
        <input
          type="number"
          min={0}
          max={50}
          className={cls(errors.yearsOfExperience)}
          value={form.yearsOfExperience}
          onChange={(e) => set('yearsOfExperience', e.target.value)}
          placeholder="5"
        />
      </FormField>

      <FormField label="Professional Summary">
        <textarea
          className={`${cls()} min-h-[120px] resize-y`}
          value={form.summary}
          onChange={(e) => set('summary', e.target.value)}
          placeholder="A brief overview of your professional background and key strengths..."
        />
      </FormField>

      <div className="mb-4">
        <p className="text-sm font-medium text-gray-700 mb-2">Notice Period</p>
        <div className="flex gap-4 mb-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="notice"
              checked={form.noticeImmediate}
              onChange={() => set('noticeImmediate', true)}
              className="text-blue-600"
            />
            <span className="text-sm text-gray-700">Available Now</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="notice"
              checked={!form.noticeImmediate}
              onChange={() => set('noticeImmediate', false)}
              className="text-blue-600"
            />
            <span className="text-sm text-gray-700">Available Later</span>
          </label>
        </div>

        {!form.noticeImmediate && (
          <div className="flex gap-3">
            <div className="w-28">
              <FormField label="" error={errors.noticeValue}>
                <input
                  type="number"
                  min={1}
                  className={cls(errors.noticeValue)}
                  value={form.noticeValue}
                  onChange={(e) => set('noticeValue', e.target.value)}
                  placeholder="2"
                />
              </FormField>
            </div>
            <div className="w-36">
              <FormField label="">
                <select
                  className={cls()}
                  value={form.noticeUnit}
                  onChange={(e) => set('noticeUnit', e.target.value as NoticePeriodUnit)}
                >
                  <option value="day">Days</option>
                  <option value="week">Weeks</option>
                  <option value="month">Months</option>
                </select>
              </FormField>
            </div>
          </div>
        )}
      </div>

      <div className="mt-6 pt-4 border-t border-gray-200 flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving...' : 'Save Professional Details'}
        </button>
        {saved && <span className="text-sm text-green-600 font-medium">✓ Saved</span>}
      </div>
    </div>
  );
}
