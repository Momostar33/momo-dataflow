import { defineConfig } from 'vite'
import tailwindcss from "@tailwindcss/vite"
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import topLevelAwait from 'vite-plugin-top-level-await';
// https://vitejs.dev/config/
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  plugins: [react() , tailwindcss(), topLevelAwait()],
  server : { 
    port : 4327, host: "127.0.0.1", strictPort: true
  } , 
  optimizeDeps: {
    // Don't optimize these packages as they contain web workers and WASM files.
    // https://github.com/vitejs/vite/issues/11672#issuecomment-1415820673
    exclude: ['@journeyapps/wa-sqlite', '@powersync/web' , '@guanmingchiu/sqlparser-ts'],
    include: ['@powersync/web > js-logger']
  },
  worker: {
    format: 'es',
    plugins: () => [ topLevelAwait()]
  } , 

  build: {
    target: "esnext"
  }
})
