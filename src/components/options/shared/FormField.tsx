import { cloneElement, isValidElement, useId } from 'react';

interface FormFieldProps {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}

export function FormField({ label, required, error, hint, children }: FormFieldProps) {
  const messageId = useId();
  const control =
    isValidElement<{ 'aria-describedby'?: string }>(children) &&
    typeof children.type === 'string' &&
    ['input', 'select', 'textarea'].includes(children.type)
      ? cloneElement(children, {
          'aria-describedby':
            [children.props['aria-describedby'], error || hint ? messageId : '']
              .filter(Boolean)
              .join(' ') || undefined,
          ...(error ? { 'aria-invalid': true } : {}),
        })
      : children;
  return (
    <div
      className="mb-4 min-w-0"
      data-field-error={!!error}
      role="group"
      aria-describedby={error || hint ? messageId : undefined}
    >
      <label className="block">
        <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          {label}
          {required && <span className="text-red-500 dark:text-red-400 ml-0.5">*</span>}
        </span>
        {control}
      </label>
      {hint && !error && (
        <p id={messageId} className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          {hint}
        </p>
      )}
      {error && (
        <p id={messageId} role="alert" className="text-xs text-red-500 dark:text-red-400 mt-1">
          {error}
        </p>
      )}
    </div>
  );
}
