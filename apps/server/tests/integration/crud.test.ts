import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { BuiltApp } from '../../src/app';
import { createFixtureProject, makeApp } from '../helpers';

let b: BuiltApp;
const base = '/mock/student-demo/api';
const j = (r: { body: string }) => JSON.parse(r.body);
const req = (method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, payload?: unknown) => b.app.inject({ method, url, payload: payload as never });

beforeAll(async () => {
  b = await makeApp();
  await createFixtureProject(b, 'students', 'student-demo');
});
afterAll(() => b.app.close());

describe('full CRUD lifecycle (spec steps 1-12)', () => {
  let id: string;

  it('lists seeded students with pagination metadata', async () => {
    const r = await req('GET', `${base}/students`);
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-type']).toContain('application/json');
    const body = j(r);
    expect(body.data).toHaveLength(10);
    expect(body.pagination).toEqual({ page: 1, limit: 10, total: 24, totalPages: 3 });
    expect(r.headers['x-total-count']).toBe('24');
  });

  it('retrieves one student', async () => {
    const r = await req('GET', `${base}/students/stu_101`);
    expect(r.statusCode).toBe(200);
    expect(j(r)).toMatchObject({ id: 'stu_101' });
  });

  it('creates a student (201) and returns the stored record', async () => {
    const r = await req('POST', `${base}/students`, { name: 'Rohan Deshmukh', email: 'rohan.deshmukh@example.com', department: 'Computer Science', year: 3 });
    expect(r.statusCode).toBe(201);
    const rec = j(r);
    expect(rec).toMatchObject({ name: 'Rohan Deshmukh', year: 3 });
    expect(rec.id).toMatch(/^stu_[0-9a-f]{8}$/);
    expect(rec.createdAt).toBeTruthy();
    id = rec.id;
  });

  it('retrieves the created student and the total increases', async () => {
    expect(j(await req('GET', `${base}/students/${id}`)).name).toBe('Rohan Deshmukh');
    expect(j(await req('GET', `${base}/students`)).pagination.total).toBe(25);
  });

  it('updates selected fields only', async () => {
    const r = await req('PATCH', `${base}/students/${id}`, { year: 4 });
    expect(r.statusCode).toBe(200);
    const rec = j(r);
    expect(rec).toMatchObject({ id, year: 4, name: 'Rohan Deshmukh' });
    expect(rec.updatedAt >= rec.createdAt).toBe(true);
    expect(j(await req('GET', `${base}/students/${id}`)).year).toBe(4);
  });

  it('ignores an attempt to overwrite the id via PATCH (rejected as unknown field)', async () => {
    const r = await req('PATCH', `${base}/students/${id}`, { id: 'stu_999' });
    expect(r.statusCode).toBe(400);
    expect(j(await req('GET', `${base}/students/${id}`)).id).toBe(id);
  });

  it('deletes with 204 and no body, then 404s', async () => {
    const r = await req('DELETE', `${base}/students/${id}`);
    expect(r.statusCode).toBe(204);
    expect(r.body).toBe('');
    expect((await req('GET', `${base}/students/${id}`)).statusCode).toBe(404);
    expect((await req('DELETE', `${base}/students/${id}`)).statusCode).toBe(404);
    expect(j(await req('GET', `${base}/students`)).pagination.total).toBe(24);
  });
});

describe('validation failures never modify data', () => {
  it('returns the documented error shape for a missing required field', async () => {
    const r = await req('POST', `${base}/students`, { name: 'No Email', department: 'Civil', year: 1 });
    expect(r.statusCode).toBe(400);
    expect(j(r)).toEqual({ error: 'VALIDATION_ERROR', message: 'The request body is invalid.', details: [{ field: 'email', message: 'This field is required.' }] });
  });
  it('rejects an invalid year / enum / email together', async () => {
    const r = await req('POST', `${base}/students`, { name: 'Bad', email: 'x', department: 'Magic', year: 9 });
    expect(j(r).details.map((d: { field: string }) => d.field).sort()).toEqual(['department', 'email', 'year']);
  });
  it('rejects an empty PATCH', async () => expect((await req('PATCH', `${base}/students/stu_101`, {})).statusCode).toBe(400));
  it('rejects a PATCH for a missing record with 404 (after validation)', async () => expect((await req('PATCH', `${base}/students/nope`, { year: 2 })).statusCode).toBe(404));
  it('rejects non-object bodies', async () => expect((await req('POST', `${base}/students`, [1, 2])).statusCode).toBe(400));
  it('did not change the dataset', async () => expect(j(await req('GET', `${base}/students`)).pagination.total).toBe(24));
});

describe('query features', () => {
  it('filters by department (case-insensitive)', async () => {
    const body = j(await req('GET', `${base}/students?department=mechanical&limit=100`));
    expect(body.data.length).toBe(body.pagination.total);
    expect(body.data.every((s: { department: string }) => s.department === 'Mechanical')).toBe(true);
  });
  it('sorts descending by name', async () => {
    const names = j(await req('GET', `${base}/students?sort=name&order=desc&limit=100`)).data.map((s: { name: string }) => s.name);
    expect(names).toEqual([...names].sort((a, b) => b.localeCompare(a)));
  });
  it('pages through everything without overlap', async () => {
    const seen = new Set<string>();
    for (const page of [1, 2, 3]) for (const s of j(await req('GET', `${base}/students?page=${page}&limit=10`)).data) seen.add(s.id);
    expect(seen.size).toBe(24);
  });
  it('returns an empty page past the end', async () => expect(j(await req('GET', `${base}/students?page=99`)).data).toEqual([]));
  it.each(['page=0', 'limit=101', 'limit=abc', 'sort=password', 'order=up', 'year=abc'])('400 for %s', async (qs) => {
    const r = await req('GET', `${base}/students?${qs}`);
    expect(r.statusCode).toBe(400);
    expect(j(r).error).toBe('INVALID_QUERY');
  });
});
