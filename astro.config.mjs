import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

export default defineConfig({
  output: 'static',
  build: {
    // Genera sismos.html en lugar de sismos/index.html para que coincida
    // con los links href="sismos.html" que ya existen en los HTML legacy.
    format: 'file',
  },
  integrations: [react()],
});
