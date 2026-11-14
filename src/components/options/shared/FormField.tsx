import { cloneElement, isValidElement, useEffect, useId, useState } from 'react';

function CharacterCount({ id, value, limit, composing }: { id: string; value: string; limit: number; composing: boolean }) {
  // Match the existing profile validators' UTF-16 length contract.
  const length = value.length;
  const over = length > limit;
  const message = over
    ? `${length - limit} ${length - limit === 1 ? 'character' : 'characters'} over the ${limit}-character limit`
    : `${length} / ${limit} characters`;
  const [announcement, setAnnouncement] = useState('');
  useEffect(() => {
    if (composing) return;
    const timer = window.setTimeout(() => setAnnouncement(length ? message : ''), 650);
    return () => window.clearTimeout(timer);
  }, [composing, length, message]);
  return <>
    <p id={id} className={`mt-1 text-xs ${over && !composing ? 'text-red-700 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}`}>{message}</p>
    <span className="sr-only" aria-live="polite" aria-atomic="true">{announcement}</span>
  </>;
}

interface FormFieldProps {
  label: string;
  labelAccessory?: React.ReactNode;
  required?: boolean;
  error?: string;
  hint?: string;
  characterLimit?: number;
  children: React.ReactNode;
}

export function FormField({ label, labelAccessory, required, error, hint, characterLimit, children }: FormFieldProps) {
  const messageId = useId();
  const countId = `${messageId}-count`;
  const [composing, setComposing] = useState(false);
  const visibleError = composing ? undefined : error;
  const labelId = `${messageId}-label`;
  const element = isValidElement<{ id?: string; value?: string; 'aria-describedby'?: string }>(children)
    ? children
    : null;
  const nativeControl =
    !!element &&
    typeof element.type === 'string' &&
    ['input', 'select', 'textarea'].includes(element.type);
  const controlId = element?.props.id ?? (nativeControl ? `${messageId}-control` : undefined);
  // A wrapping label can reactivate a dropdown trigger after an option click.
  const control =
    element && nativeControl
      ? cloneElement(element, {
          id: controlId,
          'aria-describedby':
            [element.props['aria-describedby'], visibleError || hint ? messageId : '', characterLimit ? countId : '']
              .filter(Boolean)
              .join(' ') || undefined,
          ...(visibleError ? { 'aria-invalid': true } : {}),
        })
      : children;
  return (
    <div
      className="mb-4 min-w-0"
      data-field-error={!!visibleError}
      onCompositionStart={() => setComposing(true)}
      onCompositionEnd={() => setComposing(false)}
      role="group"
      aria-labelledby={controlId ? undefined : labelId}
      aria-describedby={visibleError || hint ? messageId : undefined}
    >
      <div data-field-label className="mb-1 flex items-center gap-1">
        <label
          id={labelId}
          htmlFor={controlId}
          className="block text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          {label}
          {required && <span className="text-red-700 dark:text-red-400 ml-0.5">*</span>}
        </label>
        {labelAccessory && <div className="-my-0.5">{labelAccessory}</div>}
      </div>
      {control}
      {characterLimit && <CharacterCount id={countId} value={element?.props.value ?? ''} limit={characterLimit} composing={composing} />}
      {hint && !visibleError && (
        <p id={messageId} className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          {hint}
        </p>
      )}
      {visibleError && (
        <p id={messageId} role="alert" className="text-xs text-red-700 dark:text-red-400 mt-1">
          {visibleError}
        </p>
      )}
    </div>
  );
}
