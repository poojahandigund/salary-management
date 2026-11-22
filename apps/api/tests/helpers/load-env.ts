import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Fixed path (never user input): the .env file at the repository root.
const envPath = resolve(__dirname, '../../../../.env');

// Variables already set in the shell win over the file, so CI can inject its own values.
if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}
