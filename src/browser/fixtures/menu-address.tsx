import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';

export function MenuSelect({
  label,
  name,
  value,
  options,
  onChange,
}: {
  label: string;
  name: string;
  value: string;
  options: [string, string][];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState('');
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => setReady(true), 350);
    return () => clearTimeout(timer);
  }, [open]);
  const id = `native-${name}`,
    menu = `menu-${name}`;
  const selected = options.find((option) => option[0] === value)?.[1] ?? '–Select–';
  const choices = query
    ? options.filter((option) => option[1].toLowerCase().includes(query.toLowerCase()))
    : options.slice(0, 2);
  return (
    <div className="form-group">
      <label htmlFor={id}>{label}</label>
      <div className="select-widget">
        <div>
          <div>
            <button
              type="button"
              data-menu-id={menu}
              aria-haspopup="true"
              aria-expanded={open && ready}
              aria-label={`${label} ${selected}`}
              onClick={(event) => {
                if (!event.detail || !event.nativeEvent.view) return;
                setOpen(!open);
                setQuery('');
                setReady(false);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Escape') setOpen(false);
              }}
            >
              {selected}
            </button>
          </div>
        </div>
        <select
          id={id}
          name={name}
          value={value}
          ref={(element) => {
            element?.setAttribute('readonly', '');
          }}
          onChange={() => {}}
          aria-hidden="true"
          tabIndex={-1}
          style={{ position: 'absolute', width: 0, height: 0, opacity: 0 }}
        >
          <option value={value}></option>
        </select>
        {open &&
          ready &&
          createPortal(
            <div className="menu-popup">
              <input
                aria-label="Search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <div role="menu" id={menu}>
                {choices.map(([code, text]) => (
                  <div
                    key={code}
                    role="menuitem"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={(event) => {
                      if (!event.detail || !event.nativeEvent.view) return;
                      onChange(code);
                      setOpen(false);
                      setQuery('');
                    }}
                  >
                    {text}
                  </div>
                ))}
              </div>
            </div>,
            document.body,
          )}
      </div>
    </div>
  );
}
export function Application() {
  const [country, setCountry] = useState('US'),
    [regionCountry, setRegionCountry] = useState('US'),
    [region, setRegion] = useState('NY'),
    [file, setFile] = useState('');
  return (
    <form id="application">
      <h1>Job application</h1>
      <label>
        First name
        <input name="firstName" required />
      </label>
      <label>
        Email
        <input name="email" type="email" required />
      </label>
      {regionCountry === 'US' ? (
        <MenuSelect
          label={country === 'US' ? 'State' : 'Province'}
          name="state.value"
          value={region}
          options={[
            ['NY', 'New York'],
            ['CA', 'California'],
          ]}
          onChange={setRegion}
        />
      ) : (
        <div className="form-group">
          <label htmlFor="province">Province</label>
          <input
            id="province"
            name="state.value"
            value={region}
            onChange={(event) => setRegion(event.target.value)}
          />
        </div>
      )}
      <MenuSelect
        label="Country"
        name="countryId.value"
        value={country}
        options={[
          ['US', 'United States'],
          ['CA', 'Canada'],
          ['TH', 'Thailand'],
        ]}
        onChange={(value) => {
          setCountry(value);
          setRegion('');
          setTimeout(() => setRegionCountry(value), 300);
        }}
      />
      <div className="upload-question">
        <p>Resume*</p>
        <div className="file-widget">
          <button type="button">Choose File*</button>
          <span>{file || 'No file selected'}</span>
          <input
            type="file"
            aria-label="file-input"
            tabIndex={-1}
            accept="application/pdf"
            style={{ position: 'absolute', opacity: 0, width: 160, height: 36 }}
            onChange={(event) => setFile(event.target.files?.[0]?.name ?? '')}
          />
        </div>
        <input type="hidden" name="resumeFileId" value="" readOnly />
      </div>
      <label htmlFor="available">Date Available</label>
      <input id="available" placeholder="mm/dd/yyyy" pattern="[0-9]{2}/[0-9]{2}/[0-9]{4}" />
      <label htmlFor="pay">Desired Pay</label>
      <input id="pay" name="desiredPay" />
      <output id="country-value">{country}</output>
      <output id="region-value">{region}</output>
      <output id="file-value">{file}</output>
    </form>
  );
}
const style = document.createElement('style');
style.textContent =
  '.form-group {margin:10px}.select-widget {width:300px;position:relative}.file-widget {display:flex;position:relative;width:300px;height:40px}.menu-popup {position:fixed;top:20px;left:400px;background:white;border:1px solid black;padding:10px}[role=menuitem]{padding:8px;cursor:pointer}';
document.head.append(style);
createRoot(document.getElementById('root')!).render(<Application />);
