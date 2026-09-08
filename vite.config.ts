import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import pkg from './package.json' with { type: 'json' }

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    // Single source of truth for the version the About screen shows. It was
    // hardcoded as 1.0.0 in two places while the app shipped as 1.8.0, so
    // anyone quoting it in a review or a support mail quoted a version that
    // never existed. package.json and android/app/build.gradle already agree;
    // this makes the UI agree with them too.
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
})
