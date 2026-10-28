import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { HttpError } from './utils/errors';

const DIR = path.resolve(__dirname, '../fixtures');
const NAME = /^[a-z0-9-]{1,60}$/;

export function listFixtureNames(): string[] {
  return readdirSync(DIR)
    .filter((f) => f.endsWith('.api.json'))
    .map((f) => f.replace(/\.api\.json$/, ''))
    .sort();
}

export function loadFixture(name: string): unknown {
  if (!NAME.test(name) || !listFixtureNames().includes(name)) throw new HttpError(404, 'FIXTURE_NOT_FOUND', `Fixture "${name}" was not found.`);
  return JSON.parse(readFileSync(path.join(DIR, `${name}.api.json`), 'utf8'));
}
