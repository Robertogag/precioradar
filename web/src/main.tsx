import '@fontsource-variable/plus-jakarta-sans';
import './styles/tokens.css';
import './styles/app.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';

const root = document.getElementById('root');
if (!root) throw new Error('Falta <div id="root"> en index.html');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
