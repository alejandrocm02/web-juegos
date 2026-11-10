import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.js';
import { AppErrorBoundary } from './components/AppErrorBoundary.js';
import { AppProvider } from './store.js';
import { ChatProvider } from './lib/chat-store.js';
import { startClockSync } from './lib/clock.js';
import { initRenderMode } from './lib/renderMode.js';
import { socket } from './lib/socket.js';
import './index.css';

const container = document.getElementById('root');
if (!container) throw new Error('No se encontro el nodo raiz');

// Antes de pintar nada: las cuentas atrás dependen del desfase con el servidor.
startClockSync(socket);

initRenderMode();

createRoot(container).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <AppProvider>
        <ChatProvider>
          <App />
        </ChatProvider>
      </AppProvider>
    </AppErrorBoundary>
  </React.StrictMode>,
);
