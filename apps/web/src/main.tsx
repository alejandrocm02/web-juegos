import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.js';
import { AppProvider } from './store.js';
import './index.css';

const container = document.getElementById('root');
if (!container) throw new Error('No se encontro el nodo raiz');

createRoot(container).render(
  <React.StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </React.StrictMode>,
);
