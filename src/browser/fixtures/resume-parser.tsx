import { useState } from 'react';
import { createRoot } from 'react-dom/client';

export function Application() {
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [preferred, setPreferred] = useState('');
  const [busy, setBusy] = useState(false);
  const [parsed, setParsed] = useState(false);
  const [next, setNext] = useState(false);
  const [filename, setFilename] = useState('');
  return (
    <main>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setNext(true);
        }}
      >
        <h1>Job application</h1>
        <label>
          Given Name - Western Script
          <input
            id="given"
            autoComplete="given-name"
            required
            value={first}
            onChange={(event) => setFirst(event.target.value)}
          />
        </label>
        <label>
          Family Name - Western Script
          <input
            id="family"
            autoComplete="family-name"
            required
            value={last}
            onChange={(event) => setLast(event.target.value)}
          />
        </label>
        <label>
          Preferred name
          <input
            id="preferred"
            autoComplete="nickname"
            value={preferred}
            onChange={(event) => setPreferred(event.target.value)}
          />
        </label>
        <label>
          Email
          <input type="email" name="email" required />
        </label>
        <button disabled={busy}>Next</button>
        <output id="model">{JSON.stringify({ first, last, preferred, parsed, next })}</output>
      </form>
      <label>
        Upload Resume
        <input
          id="resume"
          type="file"
          accept=".pdf"
          onChange={(event) => {
            const file = event.target.files?.[0];
            setFilename(file?.name ?? '');
            if (!file) return;
            setBusy(true);
            setTimeout(
              () => {
                setFirst('Jane');
                setLast('(Nickname');
                setParsed(true);
                setBusy(false);
              },
              Number(new URLSearchParams(location.search).get('delay') ?? 350),
            );
          }}
        />
      </label>
      <output id="filename">{filename}</output>
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<Application />);
