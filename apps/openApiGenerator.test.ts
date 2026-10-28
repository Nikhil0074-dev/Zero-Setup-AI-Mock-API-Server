import SwaggerParser from '@apidevtools/swagger-parser';
import { describe, expect, it } from 'vitest';
import { generateOpenApi } from '../../src/modules/generator/openApiGenerator';
import { listFixtureNames } from '../../src/fixtures';
import { fixtureDef } from '../helpers';

describe('OpenAPI generator', () => {
  it.each(listFixtureNames())('produces a valid OpenAPI 3 document for %s', async (n) => {
    const doc = generateOpenApi(`${n}-demo`, fixtureDef(n));
    await expect(SwaggerParser.validate(structuredClone(doc) as never)).resolves.toBeTruthy();
  });
  it('converts :param to {param} and sets the server URL', () => {
    const doc = generateOpenApi('student-demo', fixtureDef('students')) as { paths: Record<string, unknown>; servers: Array<{ url: string }> };
    expect(Object.keys(doc.paths)).toContain('/students/{id}');
    expect(doc.servers[0]!.url).toBe('/mock/student-demo/api');
  });
  it('documents list query parameters and request bodies', () => {
    const doc = generateOpenApi('p', fixtureDef('students')) as { paths: Record<string, Record<string, { parameters: Array<{ name: string }>; requestBody?: unknown }>> };
    const names = doc.paths['/students']!.get!.parameters.map((p) => p.name);
    expect(names).toEqual(expect.arrayContaining(['page', 'limit', 'sort', 'order', 'department', 'year']));
    expect(doc.paths['/students']!.post!.requestBody).toBeTruthy();
  });
});
