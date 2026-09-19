import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/computer/',
  build: {
    outDir: '../dist/computer',
    emptyOutDir: true,
    sourcemap: false,  // Disable sourcemaps
  }
})
