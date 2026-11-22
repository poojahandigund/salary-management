import { Writable } from 'node:stream';

/** Collects pino output in memory so tests can assert on exactly what was logged. */
export function createLogCapture() {
  const lines: string[] = [];

  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      lines.push(...chunk.toString().split('\n').filter(Boolean));
      callback();
    },
  });

  return {
    stream,
    /** Everything logged so far, as one string. */
    text: () => lines.join('\n'),
    /** Each log line parsed as a JSON object. */
    entries: () => lines.map((line) => JSON.parse(line) as Record<string, unknown>),
  };
}
