import { createApp } from './app';

// Temporary: read straight from process.env. The next commit replaces this with
// validated config (zod), so a bad PORT or missing value fails with a clear message.
const port = Number(process.env.PORT ?? 4000);
const corsOrigin = process.env.CORS_ORIGIN ?? 'http://localhost:5173';

createApp({ corsOrigin }).listen(port, () => {
  // Temporary: replaced by the pino logger in a later commit.
  // eslint-disable-next-line no-console
  console.log(`API listening on http://localhost:${port}`);
});
