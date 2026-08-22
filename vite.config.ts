import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  // Relative base so the build works both at the domain root (local preview)
  // and under a subpath like GitHub Pages' /runkids/.
  base: './',
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
  },
})
