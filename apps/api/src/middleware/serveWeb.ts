import fs from 'node:fs';
import path from 'node:path';
import express, { type RequestHandler, type Router } from 'express';

const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

/**
 * Serves the built web app (the output of `npm run build -w @acme/web`) from the same
 * service as the API. One site means the SameSite=Strict login cookie works and no CORS or
 * CSRF setup is needed.
 *
 * Two parts, registered at different points in the app:
 * - `files` serves real files. Register it before the API routes.
 * - `pages` answers any other browser page address (such as /employees/7) with index.html,
 *   so the React router can show that screen after a refresh or a pasted link. Register it
 *   after the API routes.
 */
export interface WebHandlers {
  files: Router;
  pages: RequestHandler;
}

export function createWebHandlers(webRoot: string): WebHandlers {
  const root = path.resolve(webRoot);
  const indexFile = path.join(root, 'index.html');
  // Fail at startup with a clear message rather than on the first visit.
  if (!fs.existsSync(indexFile)) {
    throw new Error(`The web app is not built: ${indexFile} does not exist`);
  }

  const files = express.Router();
  files.use(
    express.static(root, {
      // "/" is handled by `pages`, so index.html gets one set of caching rules.
      index: false,
      setHeaders(res, filePath) {
        // Build output names include a hash of the content, so a changed file has a new
        // name and an old one never changes: it can be kept for a year.
        if (path.dirname(filePath) === path.join(root, 'assets')) {
          res.setHeader('Cache-Control', `public, max-age=${ONE_YEAR_SECONDS}, immutable`);
        } else {
          res.setHeader('Cache-Control', 'no-cache');
        }
      },
    }),
  );

  const pages: RequestHandler = (req, res, next) => {
    const isPageRequest = req.method === 'GET' || req.method === 'HEAD';
    // Never answer an API address or a missing file (an address with an extension, such as
    // /assets/old.js) with a page: callers must see a real 404 and not HTML.
    const looksLikeFile = path.extname(req.path) !== '';
    if (!isPageRequest || req.path.startsWith('/api') || looksLikeFile || !req.accepts('html')) {
      next();
      return;
    }
    // index.html is the one file that names the current build, so it must always be rechecked.
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile('index.html', { root }, (error) => {
      if (error) next(error);
    });
  };

  return { files, pages };
}
