import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from './context/ThemeContext';
import { SettingsProvider } from './context/SettingsContext';
import { LocationProvider } from './context/LocationContext';
import { TravelProvider } from './context/TravelContext';
import App from './App';
import './index.css';

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
