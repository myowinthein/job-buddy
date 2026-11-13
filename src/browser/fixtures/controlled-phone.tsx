import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { createRoot } from 'react-dom/client';

// A controlled phone widget: selected country and search text are independent;
// the parent stores an international number, while the native input shows local digits.
export function Application() {
  const [country, setCountry] = useState('');
  const [dial, setDial] = useState('');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [full, setFull] = useState('');
  const [number, setNumber] = useState('');
  const phone = useRef<HTMLInputElement>(null);
  useEffect(() => {
    // Deliberately reproduce the widget's parent-to-local reconciliation.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNumber(dial && full.startsWith(dial) ? full.slice(dial.length).replace(/\D/g, '') : full);
  }, [full, dial]);
  return (
    <main>
      <form>
        <h1>Job application</h1>
        <label>
          First name
          <input name="firstName" />
        </label>
        <label>
          Email
          <input name="email" type="email" />
        </label>
        <div>
          <label htmlFor="dial">Dial code</label>
          <div className="surface" id="dial-surface">
            <input
              id="dial"
              name="phoneNumber_dialCode"
              role="combobox"
              autoComplete="off"
              aria-expanded={open}
              aria-controls={open ? 'dial-options' : undefined}
              value={search}
              onMouseDown={() => setOpen(true)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setOpen(false);
              }}
              onBlur={() => {
                setOpen(false);
              }}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setOpen(!open)}
              aria-label={open ? 'Close' : 'Open'}
            >
              ⌄
            </button>
          </div>
          <label htmlFor="phone">Phone number</label>
          <div className="surface" id="phone-surface">
            <input
              id="phone"
              name="phoneNumber"
              type="tel"
              autoComplete="tel"
              required
              ref={phone}
              value={number}
              onChange={(e) => {
                setNumber(e.target.value);
                setFull(
                  `${dial}${e.target.value}`.replace(`${dial}${dial}`, dial).replace(/[^+\d]/g, ''),
                );
              }}
            />
          </div>
        </div>
        <output id="submitted-phone">{full}</output>
        <output id="selected-country">{country}</output>
      </form>
      {open &&
        createPortal(
          <div role="listbox" id="dial-options">
            {['US +1', 'CA +1', 'TH +66'].map((text) => (
              <div
                role="option"
                key={text}
                aria-selected={country === text.split(' ')[0]}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  const [nextCountry, nextDial] = text.split(' ');
                  setCountry(nextCountry);
                  setDial(nextDial);
                  setSearch(nextDial);
                  setOpen(false);
                  setFull(`${nextDial}${number}`);
                  phone.current?.focus();
                }}
              >
                {text}
              </div>
            ))}
          </div>,
          document.body,
        )}
    </main>
  );
}
const style = document.createElement('style');
style.textContent =
  '.surface {border:1px solid #aaa;border-radius:12px;padding:12px;margin:8px;width:300px} .surface input {border:0;background:transparent;width:240px} .surface:focus-within {outline:2px solid blue}';
document.head.append(style);
createRoot(document.getElementById('root')!).render(<Application />);
