// Must stay the first import: it declares the cascade layer order before any component CSS
// loads. A layer first seen later (e.g. from a component imported above it) would be ranked
// lowest. main.test.ts guards this.
import './styles/index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { registerServiceWorker } from './lib/sw.ts';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

registerServiceWorker();
