
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './', 
  define: {
    // هذا السطر يحل مشكلة عدم ظهور المفتاح في المتصفح على Netlify
    'process.env.API_KEY': JSON.stringify(process.env.API_KEY)
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    minify: 'esbuild',
    target: 'esnext',
    rollupOptions: {
      // Ensure firebase is not treated as external to prevent resolution errors
      external: [],
    }
  },
  server: {
    historyApiFallback: true,
  },
  optimizeDeps: {
    // Explicitly include firebase packages for Vite optimization
    include: ['firebase/app', 'firebase/firestore'],
  },
});
