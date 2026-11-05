import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node24',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  // Un solo archivo para desplegar en Windows sin node_modules.
  // Los módulos node:* quedan externos (los provee Node).
  noExternal: [/^(?!node:).*/],
  banner: {
    // Fastify y otras dependencias CJS usan require() dinámico.
    js: "import { createRequire as __nacioCreateRequire } from 'node:module'; const require = __nacioCreateRequire(import.meta.url);",
  },
});
