import { defineConfig } from 'tsup';

export default defineConfig({
  // `url-text` (SDK 3.23.0), `song-lyrics` and `track-onsets` (3.24.0): React-free helpers the host (sas-app main) imports too.
  entry: {
    index: 'src/index.ts',
    'url-text': 'src/utils/url-text.ts',
    'song-lyrics': 'src/utils/song-lyrics.ts',
    'track-onsets': 'src/utils/track-onsets.ts',
  },
  format: ['cjs', 'esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: ['react', 'react-dom'],
  jsx: 'automatic',
});
