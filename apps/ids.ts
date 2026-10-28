import { randomBytes } from 'node:crypto';

export const PROJECT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,40}$/;

export function randomSuffix(bytes = 4): string {
  return randomBytes(bytes).toString('hex');
}

export function slugify(input: string): string {
  const s = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30)
    .replace(/-+$/g, '');
  return s.length >= 2 ? s : 'api';
}

export function newRecordId(prefix: string): string {
  return `${prefix}_${randomSuffix(4)}`;
}
