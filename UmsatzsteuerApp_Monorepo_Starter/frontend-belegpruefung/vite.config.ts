import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  build: {
    outDir: 'dist'
  },
  // Use relative base so built assets are referenced relatively (works with GitHub Pages repo site)
  // This avoids issues when hosting under a subpath and helps in local previews.
  base: './'
  }
})
