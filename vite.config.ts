import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// GitHub Pages serves this site at https://engrdal.github.io/household_budget/,
// so every asset URL needs that prefix.
export default defineConfig({
  base: '/household_budget/',
  plugins: [react()],
})
