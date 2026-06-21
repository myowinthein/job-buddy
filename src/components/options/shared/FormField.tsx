interface FormFieldProps {
  label: string;
  required?: boolean;
  optional?: boolean;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}

export function FormField({ label, required, optional, error, hint, children }: FormFieldProps) {
  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        {label}
        {required && <span className="text-red-500 dark:text-red-400 ml-0.5">*</span>}
        {optional && !required && <span className="text-xs text-gray-400 dark:text-gray-500 font-normal ml-1">Optional</span>}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{hint}</p>}
      {error && <p className="text-xs text-red-500 dark:text-red-400 mt-1">{error}</p>}
    </div>
  );
}
