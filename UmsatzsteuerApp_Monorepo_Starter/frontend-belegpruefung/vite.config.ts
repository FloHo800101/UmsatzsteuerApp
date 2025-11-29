import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  build: {
    outDir: 'dist'
  },
  // For GitHub Pages project site (floho800101.github.io/UmsatzsteuerApp)
  // ensure built assets reference the repo base path so the scripts load correctly
  base: '/UmsatzsteuerApp/'
  }
})
