import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from './context/ThemeContext';
import { SettingsProvider } from './context/SettingsContext';
import { LocationProvider } from './context/LocationContext';
import { TravelProvider } from './context/TravelContext';
import App from './App';
// Self-hosted webfonts. Generated — see scripts/generate-fonts-css.cjs.
import './fonts.css';
import './index.css';

// Cache the globe's satellite tiles on disk (download once, then local).
// Optional: if the WebView lacks service-worker support, tiles just load from
// the network exactly as before.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <SettingsProvider>
        <LocationProvider>
          <TravelProvider>
            <App />
          </TravelProvider>
        </LocationProvider>
      </SettingsProvider>
    </ThemeProvider>
  </StrictMode>
);
