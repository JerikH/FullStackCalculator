import './shared/styles/global.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app/App';
import { CalculatorApiProvider, createCalculatorApi } from '@/shared/api';

// One client for the page's lifetime, created outside rendering.
const api = createCalculatorApi({
  baseUrl: window.location.origin,
});

const root = document.getElementById('root');
if (root === null) {
  throw new Error('Root element #root not found');
}

createRoot(root).render(
  <StrictMode>
    <CalculatorApiProvider api={api}>
      <App />
    </CalculatorApiProvider>
  </StrictMode>,
);
