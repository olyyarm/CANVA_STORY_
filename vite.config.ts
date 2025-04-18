import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/CANVA_STORY_/', // Устанавливаем базовый путь для GitHub Pages
})
