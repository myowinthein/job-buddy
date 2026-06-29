import { createContext, useContext } from 'react';
import type { ToastMessage } from './Toast';

export interface ToastContextValue {
  showToast: (type: ToastMessage['type'], message: string, duration?: number) => void;
}

export const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}
