import { defineConfig } from 'vite';

export default defineConfig({
  test: {
    include: ['src/domain/**/*.test.js', 'electron/**/*.test.js'],
    environment: 'node',
  },
});
