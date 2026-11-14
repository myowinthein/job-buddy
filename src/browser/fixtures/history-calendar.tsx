import { useState } from 'react';
import { createRoot } from 'react-dom/client';

export function DateInput({ id, label, year }: { id: string; label: string; year?: boolean }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  return (
    <div>
      <label htmlFor={id}>{label}</label>
      <div>
        <div className="react-datepicker-wrapper">
          <input
            id={id}
            value={value}
            placeholder={year ? '' : 'MM/YYYY'}
            aria-labelledby={`${id}-live`}
            onFocus={() => setOpen(true)}
            onChange={(event) => {
              const next = event.target.value;
              setValue(!next || (year ? /^\d{4}$/ : /^\d{2}\/\d{4}$/).test(next) ? next : '');
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.stopPropagation();
                setOpen(false);
              }
            }}
          />
        </div>
        <span id={`${id}-live`} className="react-datepicker__aria-live" aria-live="polite">
          {open ? `Date picker opened. Selected ${value}` : ''}
        </span>
        {open && (
          <div className="react-datepicker-popper">
            <div
              className={
                year ? 'react-datepicker__year-wrapper' : 'react-datepicker__month-wrapper'
              }
            >
              Calendar
            </div>
          </div>
        )}
      </div>
      <output data-model={id}>{value}</output>
    </div>
  );
}
export function Application() {
  return (
    <form onSubmit={(event) => event.preventDefault()}>
      <h1>Application</h1>
      <label>
        First name
        <input name="firstName" />
      </label>
      <label>
        Email
        <input type="email" name="email" />
      </label>
      <section>
        <h2>Work experience</h2>
        <fieldset>
          <label>
            Company
            <input id="company" />
          </label>
          <DateInput id="work-start" label="From" />
          <DateInput id="work-end" label="To" />
        </fieldset>
      </section>
      <section>
        <h2>Education</h2>
        {[0, 1].map((row) => (
          <fieldset key={row}>
            <label>
              School or University
              <input id={`school-${row}`} />
            </label>
            <DateInput id={`edu-${row}-start`} label="From" year />
            <DateInput id={`edu-${row}-end`} label="To (Actual or Expected)" year />
          </fieldset>
        ))}
      </section>
    </form>
  );
}
createRoot(document.getElementById('root')!).render(<Application />);
