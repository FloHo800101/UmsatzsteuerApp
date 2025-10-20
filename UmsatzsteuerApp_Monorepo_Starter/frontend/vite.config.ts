import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts'
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8080',
      '/extract': 'http://localhost:8081',
      '/elster': 'http://localhost:8082',
      '/export': 'http://localhost:8083'
    }
  }
})
