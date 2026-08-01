import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages는 https://<user>.github.io/<repo>/ 로 서빙된다.
// base를 비우면 에셋을 /assets/... 로 찾아 흰 화면이 된다.
export default defineConfig({
  base: '/perjury/',
  plugins: [react()],
})
