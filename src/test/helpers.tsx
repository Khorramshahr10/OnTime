import { type ReactNode } from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import { ThemeProvider } from '../context/ThemeContext';
import { SettingsProvider } from '../context/SettingsContext';
import { LocationProvider } from '../context/LocationContext';
import { TravelProvider } from '../context/TravelContext';

function AllProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <SettingsProvider>
        <LocationProvider>
          <TravelProvider>
            {children}
          </TravelProvider>
        </LocationProvider>
      </SettingsProvider>
    </ThemeProvider>
  );
}

export function renderWithProviders(
  ui: React.ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>,
) {
  return render(ui, { wrapper: AllProviders, ...options });
}

export { AllProviders };
