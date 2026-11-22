import { describe, expect, it } from 'vitest';
import { createLogCapture } from '../../tests/helpers/log-capture';
import { createLogger } from './logger';

describe('createLogger', () => {
  it('writes one JSON object per line with the message and level', () => {
    const capture = createLogCapture();

    createLogger('info', capture.stream).info({ port: 4000 }, 'API listening');

    const [entry] = capture.entries();
    expect(entry).toMatchObject({ level: 30, port: 4000, msg: 'API listening' });
  });

  it('hides cookies, auth headers and set-cookie values', () => {
    const capture = createLogCapture();

    createLogger('info', capture.stream).info(
      {
        req: { headers: { cookie: 'token=abc123', authorization: 'Bearer xyz789' } },
        res: { headers: { 'set-cookie': 'token=newvalue999' } },
      },
      'request',
    );

    const output = capture.text();
    expect(output).not.toContain('abc123');
    expect(output).not.toContain('xyz789');
    expect(output).not.toContain('newvalue999');
    expect(output).toContain('[Redacted]');
  });

  it('hides password fields', () => {
    const capture = createLogCapture();

    createLogger('info', capture.stream).info({ body: { password: 'hunter2-secret' } }, 'login');

    expect(capture.text()).not.toContain('hunter2-secret');
  });

  it('does not write anything below the configured level', () => {
    const capture = createLogCapture();

    createLogger('warn', capture.stream).info('too quiet');

    expect(capture.entries()).toHaveLength(0);
  });
});
