import { render, act } from '@testing-library/react';
import { ThemeProvider, useTheme } from '../context/ThemeContext';
import type { Theme } from '../context/ThemeContext';

// jsdom does not implement window.matchMedia — provide a minimal stub
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

function ThemeInspector({ onTheme }: { onTheme: (data: { theme: Theme; effectiveTheme: string }) => void }) {
  const { theme, effectiveTheme } = useTheme();
  onTheme({ theme, effectiveTheme });
  return null;
}

describe('User story: The app respects my chosen color theme', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.documentElement.classList.remove('dark', 'desert', 'rose', 'forest', 'ocean');
  });

  it('defaults to system theme on first launch', async () => {
    let captured: { theme: Theme; effectiveTheme: string } | null = null;

    await act(async () => {
      render(
        <ThemeProvider>
          <ThemeInspector onTheme={(d) => { captured = d; }} />
        </ThemeProvider>,
      );
    });

    expect(captured!.theme).toBe('system');
  });

  it('applies dark class to document when dark theme is active', async () => {
    const { Preferences } = await import('@capacitor/preferences');
    vi.mocked(Preferences.get).mockResolvedValue({ value: 'dark' });

    await act(async () => {
      render(
        <ThemeProvider>
          <ThemeInspector onTheme={() => {}} />
        </ThemeProvider>,
      );
    });

    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('applies desert class for desert theme', async () => {
    const { Preferences } = await import('@capacitor/preferences');
    vi.mocked(Preferences.get).mockResolvedValue({ value: 'desert' });

    await act(async () => {
      render(
        <ThemeProvider>
          <ThemeInspector onTheme={() => {}} />
        </ThemeProvider>,
      );
    });

    expect(document.documentElement.classList.contains('desert')).toBe(true);
  });

  it('does not add any theme class for light theme', async () => {
    const { Preferences } = await import('@capacitor/preferences');
    vi.mocked(Preferences.get).mockResolvedValue({ value: 'light' });

    await act(async () => {
      render(
        <ThemeProvider>
          <ThemeInspector onTheme={() => {}} />
        </ThemeProvider>,
      );
    });

    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.documentElement.classList.contains('desert')).toBe(false);
    expect(document.documentElement.classList.contains('rose')).toBe(false);
    expect(document.documentElement.classList.contains('forest')).toBe(false);
    expect(document.documentElement.classList.contains('ocean')).toBe(false);
  });

  it('supports all 6 theme options without error', async () => {
    const themes: Theme[] = ['light', 'dark', 'system', 'auto', 'desert', 'rose'];

    for (const themeValue of themes) {
      const { Preferences } = await import('@capacitor/preferences');
      vi.mocked(Preferences.get).mockResolvedValue({ value: themeValue });

      const { unmount } = await act(async () => {
        return render(
          <ThemeProvider>
            <ThemeInspector onTheme={() => {}} />
          </ThemeProvider>,
        );
      });

      // No assertion needed — just verifying it doesn't throw
      unmount();
      document.documentElement.classList.remove('dark', 'desert', 'rose', 'forest', 'ocean');
    }
  });
});
