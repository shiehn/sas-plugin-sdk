import { defineConfig } from 'tsup';

export default defineConfig({
  // `url-text`: React-free helpers the host (sas-app main) imports too (SDK 3.23.0).
  entry: { index: 'src/index.ts', 'url-text': 'src/utils/url-text.ts' },
  format: ['cjs', 'esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: ['react', 'react-dom'],
  jsx: 'automatic',
});
