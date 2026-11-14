import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { createRoot } from 'react-dom/client';

// Reproduces a single-value React select: input holds only the search query,
// its opacity becomes zero after selection, and options live in a portal.
export function SearchSelect({
  id,
  label,
  options,
  async = false,
}: {
  id: string;
  label: string;
  options: [string, string][];
  async?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [value, setValue] = useState('');
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(!async);
  const inputId =
    id === 'authorized' ? 'question_20607392004' : id === 'gender' ? '4026376004' : id;
  useEffect(() => {
    if (!async || !open) return;
    const timer = setTimeout(() => setReady(true), 350);
    return () => clearTimeout(timer);
  }, [async, open]);
  return (
    <div className="question">
      <label id={`${id}-label`} htmlFor={inputId}>
        {label}
      </label>
      <div className="select__control" id={`${id}-surface`}>
        <div className="select__value-container">
          {value && <div className="select__single-value">{value}</div>}
          <div className="select__input-container">
            <input
              id={inputId}
              role="combobox"
              aria-labelledby={`${id}-label`}
              autoComplete="off"
              aria-controls={open ? `${id}-options` : undefined}
              aria-expanded={open}
              aria-busy={open && !ready}
              style={{
                opacity: value ? 0 : 1,
                width: 4,
                color: 'rgb(20, 20, 20)',
                background: 'transparent',
              }}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onMouseDown={() => setOpen(true)}
              onBlur={() => setOpen(false)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setOpen(false);
                if (e.key === 'Backspace' && !query) setValue('');
              }}
            />
          </div>
        </div>
        <button
          type="button"
          aria-label={`Clear ${label}`}
          onClick={() => {
            setValue('');
            setQuery('');
            setOpen(false);
          }}
        >
          ×
        </button>
      </div>
      <output id={`${id}-answer`}>{value}</output>
      {open &&
        createPortal(
          <div id={`${id}-options`} role="listbox">
            {ready &&
              options.map(([text, answer]) => (
                <div
                  key={text}
                  role="option"
                  aria-selected={value === answer}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setValue(answer);
                    setQuery('');
                    setOpen(false);
                  }}
                >
                  {text}
                </div>
              ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
export function Upload({ id, label }: { id: string; label: string }) {
  return (
    <div role="group" aria-labelledby={`${id}-heading`}>
      <div id={`${id}-heading`}>{label}</div>
      <div>
        <label htmlFor={id}>Attach</label>
        <input id={id} type="file" accept=".pdf" />
      </div>
    </div>
  );
}
export function Application() {
  return (
    <form>
      <h1>Job application</h1>
      <label>
        First name
        <input name="firstName" required />
      </label>
      <label>
        Email
        <input name="email" type="email" required />
      </label>
      <fieldset>
        <legend>Phone</legend>
        <SearchSelect
          id="country"
          label="Country"
          options={[
            ['Canada +1', '+1'],
            ['United States +1', '+1'],
            ['Thailand +66', '+66'],
          ]}
        />
        <label htmlFor="phone">Phone</label>
        <input id="phone" type="tel" pattern="[0-9]{9}" required />
      </fieldset>
      <SearchSelect
        id="city"
        label="Location (City)"
        async
        options={[
          ['Bangkok, Central Java, Indonesia', 'Bangkok, Central Java, Indonesia'],
          ['Bangkok, Thailand', 'Bangkok, Thailand'],
        ]}
      />
      <Upload id="resume" label="Resume/CV *" />
      <Upload id="cover_letter" label="Cover Letter" />
      <Upload id="portfolio" label="Attach a portfolio for review:" />
      <SearchSelect
        id="authorized"
        label="Are you legally authorized to work in the United States?"
        options={[
          ['Yes', 'Yes'],
          ['No', 'No'],
        ]}
      />
      <SearchSelect
        id="sponsor"
        label="Will you now or in the future require sponsorship for employment visa status?"
        options={[
          ['Yes', 'Yes'],
          ['No', 'No'],
        ]}
      />
      <SearchSelect
        id="gender"
        label="What gender identity do you most closely identify with? (Select one)"
        options={[
          ['Male', 'Male'],
          ['Female', 'Female'],
        ]}
      />
    </form>
  );
}
const style = document.createElement('style');
style.textContent =
  '.select__control {border:1px solid #ccc;background:white;padding:10px;width:320px}.select__value-container {display:flex}.select__single-value {color:rgb(20,20,20)} [role=option] {padding:8px} .question {margin:8px}';
document.head.append(style);
createRoot(document.getElementById('root')!).render(<Application />);
