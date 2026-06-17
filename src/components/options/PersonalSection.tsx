import { useState } from 'react';
import type { Profile } from '@/src/types/profile';
import { FormField } from './shared/FormField';

interface Props {
  profile: Partial<Profile>;
  onSave: (updates: Partial<Profile>) => Promise<void>;
}

const cls = (err?: string) =>
  err
    ? 'w-full px-3 py-2 border border-red-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500'
    : 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

export function PersonalSection({ profile, onSave }: Props) {
  const p = profile.personal;
  const [form, setForm] = useState({
    firstName: p?.firstName ?? '',
    lastName: p?.lastName ?? '',
    email: p?.email ?? '',
    phone: p?.phone ?? '',
    dateOfBirth: p?.dateOfBirth ?? '',
    gender: p?.gender ?? '',
    ethnicity: p?.ethnicity ?? '',
    veteranStatus: p?.veteranStatus ?? '',
    disabilityStatus: p?.disabilityStatus ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const set = (key: string, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: '' }));
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.firstName.trim()) e.firstName = 'First name is required';
    if (!form.lastName.trim()) e.lastName = 'Last name is required';
    if (!form.email.trim()) e.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Enter a valid email address';
    if (!form.phone.trim()) e.phone = 'Phone number is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    await onSave({
      personal: {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        dateOfBirth: form.dateOfBirth || undefined,
        gender: form.gender || undefined,
        ethnicity: form.ethnicity || undefined,
        veteranStatus: form.veteranStatus || undefined,
        disabilityStatus: form.disabilityStatus || undefined,
      },
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Personal Information</h2>
        <p className="text-sm text-gray-500 mt-1">Basic personal details used in job applications</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <FormField label="First Name" required error={errors.firstName}>
          <input
            className={cls(errors.firstName)}
            value={form.firstName}
            onChange={(e) => set('firstName', e.target.value)}
            placeholder="John"
          />
        </FormField>
        <FormField label="Last Name" required error={errors.lastName}>
          <input
            className={cls(errors.lastName)}
            value={form.lastName}
            onChange={(e) => set('lastName', e.target.value)}
            placeholder="Doe"
          />
        </FormField>
      </div>

      <FormField label="Email" required error={errors.email}>
        <input
          type="email"
          className={cls(errors.email)}
          value={form.email}
          onChange={(e) => set('email', e.target.value)}
          placeholder="john@example.com"
        />
      </FormField>

      <FormField label="Phone" required error={errors.phone}>
        <input
          type="tel"
          className={cls(errors.phone)}
          value={form.phone}
          onChange={(e) => set('phone', e.target.value)}
          placeholder="+1 555 000 0000"
        />
      </FormField>

      <FormField label="Date of Birth" hint="Optional — some applications request this">
        <input
          type="date"
          className={cls()}
          value={form.dateOfBirth}
          onChange={(e) => set('dateOfBirth', e.target.value)}
        />
      </FormField>

      <div className="grid grid-cols-2 gap-4">
        <FormField label="Gender">
          <select className={cls()} value={form.gender} onChange={(e) => set('gender', e.target.value)}>
            <option value="">Prefer not to say</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="non_binary">Non-binary</option>
            <option value="other">Other</option>
          </select>
        </FormField>
        <FormField label="Ethnicity">
          <input
            className={cls()}
            value={form.ethnicity}
            onChange={(e) => set('ethnicity', e.target.value)}
            placeholder="Optional"
          />
        </FormField>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <FormField label="Veteran Status">
          <select
            className={cls()}
            value={form.veteranStatus}
            onChange={(e) => set('veteranStatus', e.target.value)}
          >
            <option value="">Prefer not to say</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </FormField>
        <FormField label="Disability Status">
          <select
            className={cls()}
            value={form.disabilityStatus}
            onChange={(e) => set('disabilityStatus', e.target.value)}
          >
            <option value="">Prefer not to say</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </FormField>
      </div>

      <div className="mt-6 pt-4 border-t border-gray-200 flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving...' : 'Save Personal Information'}
        </button>
        {saved && <span className="text-sm text-green-600 font-medium">✓ Saved</span>}
      </div>
    </div>
  );
}
