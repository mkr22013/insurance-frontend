import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import federation from '@originjs/vite-plugin-federation'

export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    tailwindcss(),
    ...(command === 'build'
      ? [
          federation({
            name: 'insurance-assistant',
            filename: 'remoteEntry.js',
            exposes: {
              './App': './src/App.tsx',
            },
          }),
        ]
      : []),
  ],
  build: {
    target: 'esnext',
    minify: false,
    cssCodeSplit: false,
  },
  server: {
    port: 5173,
  },
}))