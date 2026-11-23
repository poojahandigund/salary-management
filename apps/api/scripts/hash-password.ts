/**
 * Creates the bcrypt hash to put in .env as HR_PASSWORD_HASH:
 *   npm run hash-password -w @acme/api
 *
 * The password is typed at a hidden prompt, so it never appears on screen, in the shell
 * history or in the process list (it is NOT taken as a command-line argument). Only the
 * hash is printed. The prompts go to stderr so that stdout holds nothing but the line to
 * copy.
 */
import { MAX_PASSWORD_BYTES } from '../src/auth/limits';
import { hashPassword } from '../src/auth/password';

/** A policy for the account you are creating, not a check made when someone logs in. */
const MIN_PASSWORD_LENGTH = 12;

/** Reads one line without echoing it. Handles paste, backspace and Ctrl+C. */
function readHidden(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const { stdin, stderr } = process;
    stderr.write(prompt);

    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    let typed = '';
    const finish = (): void => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener('data', onData);
      stderr.write('\n');
    };
    const onData = (chunk: string): void => {
      for (const character of chunk) {
        if (character === '\r' || character === '\n') {
          finish();
          resolve(typed);
          return;
        }
        if (character === '\u0003') {
          finish();
          reject(new Error('Cancelled'));
          return;
        }
        if (character === '\u007f' || character === '\b') {
          typed = typed.slice(0, -1);
        } else {
          typed += character;
        }
      }
    };
    stdin.on('data', onData);
  });
}

/** When input is piped in (not typed), read its first line. Nothing is echoed either way. */
async function readPipedLine(): Promise<string> {
  let text = '';
  for await (const chunk of process.stdin) {
    text += String(chunk);
  }
  return text.split(/\r?\n/, 1)[0] ?? '';
}

async function main(): Promise<void> {
  let password: string;
  if (process.stdin.isTTY) {
    password = await readHidden('New password: ');
    const confirmation = await readHidden('Repeat password: ');
    if (password !== confirmation) {
      throw new Error('The two passwords do not match. Nothing was created.');
    }
  } else {
    password = await readPipedLine();
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) {
    throw new Error(
      `Use at most ${MAX_PASSWORD_BYTES} bytes (about ${MAX_PASSWORD_BYTES} plain characters).`,
    );
  }

  const hash = await hashPassword(password);
  // Single quotes are required in .env: the hash contains "$", which would otherwise be
  // treated as the start of a variable.
  process.stdout.write(`HR_PASSWORD_HASH='${hash}'\n`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
