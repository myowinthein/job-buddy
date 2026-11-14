import { useState } from 'react';
import { createRoot } from 'react-dom/client';

export function Application() {
  const [form, setForm] = useState({ country: 'CAN', firstName: '', email: '' });
  const [stage, setStage] = useState('personal');
  const [error, setError] = useState('');
  return (
    <main>
      <h1>Job application</h1>
      <output id="model-country">{form.country}</output>
      <output id="stage">{stage}</output>
      <output id="error">{error}</output>
      <form hidden={stage !== 'personal'}>
        <label>
          Country
          <select
            id="country"
            required
            value={form.country}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setTimeout(() => setForm({ ...form, country: value }), 30);
            }}
            onBlur={(event) => setForm({ ...form, country: event.currentTarget.value })}
          >
            <option value="">Please Select</option>
            <option value="CAN">Canada</option>
            <option value="THA">Thailand</option>
          </select>
        </label>
        <label>
          First name
          <input
            name="firstName"
            required
            value={form.firstName}
            onChange={(event) => setForm({ ...form, firstName: event.currentTarget.value })}
          />
        </label>
        <label>
          Email
          <input
            name="email"
            type="email"
            required
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.currentTarget.value })}
          />
        </label>
        <button
          type="button"
          onClick={(event) => {
            const country = document.querySelector<HTMLSelectElement>('#country')!;
            if (country.value !== form.country || !form.country) {
              setForm({ ...form, country: '' });
              setError('Country was not saved');
            } else if (event.currentTarget.form!.reportValidity()) {
              setError('');
              setStage('experience');
            }
          }}
        >
          Next
        </button>
      </form>
    </main>
  );
}
createRoot(document.querySelector('#root')!).render(<Application />);
