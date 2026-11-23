import express, { type Express } from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { AppError } from '../lib/errors';
import { createLogCapture } from '../../tests/helpers/log-capture';
import { createLogger } from '../lib/logger';
import { errorHandler, notFoundHandler } from './errorHandler';
import { createRequestLogger } from './requestLogger';

/** A tiny app wired like the real one, with routes that fail in specific ways. */
function buildApp(configureRoutes: (app: Express) => void): Express {
  const app = express();
  app.use(createRequestLogger(createLogger('silent')));
  app.use(express.json({ limit: '1kb' }));
  configureRoutes(app);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

describe('errorHandler', () => {
  it('returns a generic 500 and hides the real error message', async () => {
    const app = buildApp((a) =>
      a.get('/boom', () => {
        throw new Error('connection to db-prod-01 refused, password=hunter2');
      }),
    );

    const res = await request(app).get('/boom');

    expect(res.status).toBe(500);
    expect(res.body.error).toMatchObject({
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    });
    expect(res.text).not.toContain('db-prod-01');
    expect(res.text).not.toContain('hunter2');
    expect(res.text).not.toContain('stack');
  });

  it('also catches errors thrown inside async handlers', async () => {
    const app = buildApp((a) =>
      a.get('/async-boom', async () => {
        await Promise.resolve();
        throw new Error('async failure');
      }),
    );

    const res = await request(app).get('/async-boom');

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
  });

  it('uses the status, code and message of an AppError', async () => {
    const app = buildApp((a) =>
      a.get('/missing', () => {
        throw new AppError(404, 'EMPLOYEE_NOT_FOUND', 'Employee not found', { id: 42 });
      }),
    );

    const res = await request(app).get('/missing');

    expect(res.status).toBe(404);
    expect(res.body.error).toMatchObject({
      code: 'EMPLOYEE_NOT_FOUND',
      message: 'Employee not found',
      details: { id: 42 },
    });
  });

  it('turns a ZodError into a 400 listing each invalid field', async () => {
    const schema = z.object({ email: z.email(), age: z.number() });
    const app = buildApp((a) =>
      a.get('/validate', () => {
        schema.parse({ email: 'nope', age: 'x' });
      }),
    );

    const res = await request(app).get('/validate');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    const paths = (res.body.error.details as { path: string }[]).map((d) => d.path);
    expect(paths).toEqual(['email', 'age']);
  });

  it('returns 400 for a malformed JSON body without echoing parser details', async () => {
    const app = buildApp((a) => a.post('/echo', (req, res) => res.json(req.body)));

    const res = await request(app)
      .post('/echo')
      .set('Content-Type', 'application/json')
      .send('{"broken": ');

    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({ code: 'BAD_REQUEST', message: 'Malformed request' });
  });

  it('returns 413 when the body is over the size limit', async () => {
    const app = buildApp((a) => a.post('/echo', (req, res) => res.json(req.body)));

    const res = await request(app)
      .post('/echo')
      .send({ data: 'x'.repeat(5_000) });

    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('includes a requestId in every error response', async () => {
    const app = buildApp((a) =>
      a.get('/boom', () => {
        throw new Error('x');
      }),
    );

    const res = await request(app).get('/boom');

    expect(typeof res.body.error.requestId).toBe('string');
    expect(res.body.error.requestId.length).toBeGreaterThan(0);
  });
});

describe('error logging', () => {
  function buildLoggedApp(capture: ReturnType<typeof createLogCapture>): Express {
    const app = express();
    app.use(createRequestLogger(createLogger('info', capture.stream)));
    app.get('/boom', () => {
      throw new Error('db-prod-01 refused the connection');
    });
    app.get('/missing', () => {
      throw new AppError(404, 'EMPLOYEE_NOT_FOUND', 'Employee not found');
    });
    app.use(errorHandler);
    return app;
  }

  it('logs the real error and stack for a 500, even though the caller never sees them', async () => {
    const capture = createLogCapture();

    const res = await request(buildLoggedApp(capture)).get('/boom');

    await expect.poll(() => capture.entries().length).toBe(1);
    const [entry] = capture.entries();
    expect(entry?.level).toBe(50); // error
    expect(JSON.stringify(entry?.err)).toContain('db-prod-01 refused the connection');
    expect(JSON.stringify(entry?.err)).toContain('at '); // a stack trace
    expect(res.text).not.toContain('db-prod-01');
  });

  it('logs expected client errors as warnings without a stack trace', async () => {
    const capture = createLogCapture();

    await request(buildLoggedApp(capture)).get('/missing');

    await expect.poll(() => capture.entries().length).toBe(1);
    const [entry] = capture.entries();
    expect(entry?.level).toBe(40); // warn
    expect(entry?.err).toBeUndefined();
  });
});

describe('errorHandler after the response has started', () => {
  it('passes the error on instead of trying to send a second response', () => {
    const failure = new Error('failed half-way through streaming');
    const res = { headersSent: true, status: vi.fn(), json: vi.fn() };
    const next = vi.fn();

    errorHandler(failure, { id: 'req-1' } as never, res as never, next);

    expect(next).toHaveBeenCalledExactlyOnceWith(failure);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });
});

describe('notFoundHandler', () => {
  it('returns a JSON 404 for unknown routes', async () => {
    const app = buildApp(() => undefined);

    const res = await request(app).get('/nothing-here');

    expect(res.status).toBe(404);
    expect(res.body.error).toMatchObject({ code: 'ROUTE_NOT_FOUND', message: 'Route not found' });
  });
});
