import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';

export function Application() {
  const [value, setValue] = useState('');
  const [query, setQuery] = useState('');
  const [searches, setSearches] = useState(0);
  const [open, setOpen] = useState(false);
  const choices = [
    ['', '–Select–'],
    ['arts', 'College - Bachelor of Arts'],
    ['science', 'College - Bachelor of Science'],
  ];
  return (
    <form>
      <h1>Job application</h1>
      <label>
        First name
        <input name="firstName" />
      </label>
      <label>
        Email
        <input type="email" name="email" />
      </label>
      <label htmlFor="degree">Degree</label>
      <div>
        <button
          type="button"
          role="combobox"
          aria-label="Degree"
          aria-controls="choices"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-valuetext={value ? choices.find(([id]) => id === value)?.[1] : ''}
          onClick={() => setOpen(!open)}
        >
          {choices.find(([id]) => id === value)?.[1]}
        </button>
        <select
          id="degree"
          name="educationLevel"
          value={value}
          onChange={() => {}}
          aria-hidden="true"
          ref={(element) => element?.setAttribute('readonly', '')}
          style={{ opacity: 0, width: 0, height: 0 }}
        >
          <option value={value}></option>
        </select>
        {value && (
          <button type="button" aria-label="Clear Selection" onClick={() => setValue('')}>
            Clear
          </button>
        )}
        {open &&
          createPortal(
            <div>
              <input
                aria-label="Search"
                value={query}
                onChange={(event) => {
                  setSearches(searches + 1);
                  setQuery(event.target.value);
                }}
              />
              <div id="choices" role="listbox">
                {choices
                  .filter(([, label]) => label.toLowerCase().includes(query.toLowerCase()))
                  .map(([id, label]) => (
                    <div
                      role="option"
                      key={id}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        setValue(id);
                        setOpen(false);
                        setQuery('');
                      }}
                    >
                      {label}
                    </div>
                  ))}
              </div>
            </div>,
            document.body,
          )}
      </div>
      <output id="selected">{value}</output>
      <output id="searches">{searches}</output>
    </form>
  );
}
createRoot(document.getElementById('root')!).render(<Application />);
