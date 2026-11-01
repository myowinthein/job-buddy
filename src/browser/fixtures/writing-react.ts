import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
const root = createRoot(document.querySelector('#react-root')!);
function App() {
  const [text, setText] = useState('');
  const [checked, setChecked] = useState(false);
  const [blurred, setBlurred] = useState(false);
  const [tick, setTick] = useState(0);
  return React.createElement(
    'form',
    null,
    React.createElement(
      'label',
      null,
      'First name',
      React.createElement('input', {
        id: 'react-text',
        value: text,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => setText(e.target.value),
        onBlur: () => setBlurred(true),
      }),
    ),
    React.createElement(
      'label',
      null,
      'Currently working here',
      React.createElement('input', {
        id: 'react-check',
        type: 'checkbox',
        checked,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => setChecked(e.target.checked),
      }),
    ),
    React.createElement(
      'button',
      { type: 'button', id: 'rerender', onClick: () => setTick(tick + 1) },
      'Rerender',
    ),
    React.createElement(
      'output',
      { id: 'react-state' },
      JSON.stringify({ text, checked, blurred, tick }),
    ),
  );
}
flushSync(() => root.render(React.createElement(App)));
