import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
const fixtureRoot = document.querySelector('#react-root')!;
const root = createRoot(fixtureRoot);
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
let generatedId = 0;
function RegeneratedField({
  name,
  label,
  placeholder,
}: {
  name: string;
  label: string;
  placeholder?: string;
}) {
  const [value, setValue] = useState('');
  const [blurred, setBlurred] = useState(false);
  const id = `generated-field-${++generatedId}`;
  return React.createElement(
    'div',
    null,
    React.createElement('label', { htmlFor: id }, label),
    React.createElement('input', {
      id,
      name,
      value,
      placeholder,
      required: name !== 'desiredPay',
      onChange: (event: React.ChangeEvent<HTMLInputElement>) => setValue(event.target.value),
      onBlur: () => setBlurred(true),
      'data-blurred': blurred,
    }),
  );
}
function RegeneratedFields() {
  return React.createElement(
    'form',
    null,
    React.createElement('h1', null, 'Job application'),
    ...[
      { name: 'streetAddress.value', label: 'Address' },
      { name: 'city.value', label: 'City' },
      { name: 'province.value', label: 'Province' },
      { name: 'postalCode.value', label: 'Postal Code' },
      { name: 'dateAvailable', label: 'Date Available', placeholder: 'dd/mm/yyyy' },
      { name: 'desiredPay', label: 'Desired Pay' },
    ].map((field) => React.createElement(RegeneratedField, { ...field, key: field.name })),
  );
}
flushSync(() =>
  root.render(
    React.createElement(fixtureRoot.hasAttribute('data-regenerated-ids') ? RegeneratedFields : App),
  ),
);
