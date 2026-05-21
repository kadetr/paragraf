// main.tsx — React root render entry point.

import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';

const container = document.getElementById('root');
if (!container) throw new Error('No #root element found');

createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
