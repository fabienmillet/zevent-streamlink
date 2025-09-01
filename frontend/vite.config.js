import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig(({ mode }) => {
  // Charger les variables d'environnement
  const env = loadEnv(mode, process.cwd(), '')
  
  return {
    plugins: [vue()],
    server: {
      host: env.VITE_HOST || '0.0.0.0',
      port: parseInt(env.VITE_PORT) || 80,
      allowedHosts: [
        'streamlink.zevent',
        'localhost',
        '127.0.0.1'
      ]
    }
  }
})
