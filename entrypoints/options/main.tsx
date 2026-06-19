import React from 'react';
import ReactDOM from 'react-dom/client';
import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import App from './App.tsx';
import { ToastProvider } from '@/src/components/ui/Toast';
import './style.css';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </React.StrictMode>,
);
