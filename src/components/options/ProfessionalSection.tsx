import { useState } from 'react';
import type { Profile, NoticePeriodUnit } from '@/src/types/profile';
import { calculateExperience } from '@/src/utils/experience';
import { FormField } from './shared/FormField';

interface Props {
  profile: Partial<Profile>;
  onSave: (updates: Partial<Profile>) => Promise<void>;
}

const cls = (err?: string) =>
  err
    ? 'w-full px-3 py-2 border border-red-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500'
    : 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

// Maximum notice period values per unit to prevent nonsensical inputs.
const NOTICE_MAX: Record<NoticePeriodUnit, number> = {
  day: 365,
  week: 52,
  month: 24,
};

export function ProfessionalSection({ profile, onSave }: Props) {
  const p = profile.professional;
  const [form, setForm] = useState({
    currentTitle: p?.currentTitle ?? '',
    currentCompany: p?.currentCompany ?? '',
    summary: p?.summary ?? '',
    noticeImmediate: p?.noticePeriod?.immediate ?? true,
    noticeValue: p?.noticePeriod?.value?.toString() ?? '',
    noticeUnit: (p?.noticePeriod?.unit ?? 'week') as NoticePeriodUnit,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Derived — never entered manually
  const experience = calculateExperience(profile.workHistory);

  const set = (key: string, value: string | boolean) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (typeof value === 'string' && errors[key]) setErrors((e) => ({ ...e, [key]: '' }));
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.currentTitle.trim()) e.currentTitle = 'Current title is required';
    if (!form.currentCompany.trim()) e.currentCompany = 'Current company is required';

    if (!form.noticeImmediate) {
      const val = Number(form.noticeValue);
      const max = NOTICE_MAX[form.noticeUnit];
      if (!form.noticeValue.trim() || isNaN(val)) {
        e.noticeValue = 'Enter a duration';
      } else if (val < 1) {
        e.noticeValue = 'Must be at least 1';
      } else if (val > max) {
        e.noticeValue = `Maximum is ${max} ${form.noticeUnit}${max !== 1 ? 's' : ''}`;
      }
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
        // Cache the derived value so profileCompletion.ts can read it without
        // access to workHistory. It is always recomputed from workHistory on
        // save; the user never manually sets it.
        yearsOfExperience: experience.years + Math.round(experience.months / 12),
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
          maxLength={150}
        />
      </FormField>

      <FormField label="Current Company" required error={errors.currentCompany}>
        <input
          className={cls(errors.currentCompany)}
          value={form.currentCompany}
          onChange={(e) => set('currentCompany', e.target.value)}
          placeholder="Acme Corp"
          maxLength={150}
        />
      </FormField>

      {/* Total Experience — read-only, derived from Work History */}
      <div className="mb-4 p-3 bg-blue-50 border border-blue-100 rounded-lg flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700">Total Experience</span>
        <span className="text-sm font-semibold text-blue-700">{experience.label}</span>
      </div>
      <p className="text-xs text-gray-400 -mt-2 mb-4">
        Calculated automatically from your Work History.
      </p>

      <FormField label="Professional Summary">
        <textarea
          className={`${cls()} min-h-[120px] resize-y`}
          value={form.summary}
          onChange={(e) => set('summary', e.target.value)}
          placeholder="A brief overview of your professional background and key strengths..."
          maxLength={2000}
        />
      </FormField>

      {/* Notice Period */}
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
          <div className="flex gap-3 items-start">
            <div className="w-28">
              <FormField label="" error={errors.noticeValue}>
                <input
                  type="number"
                  min={1}
                  max={NOTICE_MAX[form.noticeUnit]}
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
                  onChange={(e) => {
                    const unit = e.target.value as NoticePeriodUnit;
                    set('noticeUnit', unit);
                    // Clear error when unit changes so the user sees the new limit
                    setErrors((err) => ({ ...err, noticeValue: '' }));
                  }}
                >
                  <option value="day">Days (max {NOTICE_MAX.day})</option>
                  <option value="week">Weeks (max {NOTICE_MAX.week})</option>
                  <option value="month">Months (max {NOTICE_MAX.month})</option>
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
