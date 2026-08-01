export const fieldCls = (err?: string, disabled?: boolean) => {
  const base = err
    ? 'w-full px-3 py-2 border border-red-300 dark:border-red-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500'
    : 'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
  return disabled ? `${base} opacity-50 cursor-not-allowed bg-gray-50 dark:bg-gray-700` : base;
};
