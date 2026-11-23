/**
 * Builds the production server into dist/server.js:
 *   npm run build -w @acme/api
 *
 * Why a bundler instead of plain `tsc`: the shared package (`@acme/shared`) is TypeScript
 * source with no build step of its own, which Node cannot run. esbuild compiles it into the
 * server file, so `node dist/server.js` needs nothing but the installed dependencies.
 *
 * Everything else in node_modules (express, pg, bcrypt, ...) stays external and is loaded
 * normally at runtime. That keeps native modules such as bcrypt working and the output small.
 */
import path from 'node:path';
import { build } from 'esbuild';

async function main(): Promise<void> {
  await build({
    entryPoints: ['src/server.ts'],
    outfile: 'dist/server.js',
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'cjs',
    sourcemap: true,
    // Leave installed packages alone...
    packages: 'external',
    // ...except our own shared package, which is read from its source folder and bundled.
    alias: { '@acme/shared': path.resolve('../../packages/shared/src/index.ts') },
    logLevel: 'info',
  });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
