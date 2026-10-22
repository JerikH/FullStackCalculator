import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './shared/styles/global.css';

const root = document.getElementById('root');
if (root === null) {
  throw new Error('Root element #root not found');
}

createRoot(root).render(
  <StrictMode>
    <main>
      <h1>Calculator</h1>
    </main>
  </StrictMode>,
);
