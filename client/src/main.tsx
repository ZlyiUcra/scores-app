import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { I18nProvider } from './i18n';
import { AuthProvider } from './auth/AuthContext';
import { App } from './App';
import './styles.css';

// Entry point: provider order matters — i18n wraps auth so even the login
// screen is translatable.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/* Opt in to the v7 behaviors early — silences the future-flag warnings
        and makes the eventual react-router upgrade a no-op here. */}
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <I18nProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </I18nProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
