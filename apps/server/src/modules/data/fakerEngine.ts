import { Faker, en } from '@faker-js/faker';
import type { FieldDef } from '../../types';

/** Fixed reference date so seeded data is reproducible (Faker dates are otherwise relative to now). */
export const REF_DATE = new Date('2026-01-01T00:00:00.000Z');

export type FakerFn = (f: Faker, def: FieldDef) => string | number | boolean;

/** Allowlist of generators a definition may reference by name. Unknown names fall back to type-based generation. */
export const FAKER_GENERATORS: Record<string, FakerFn> = {
  'person.fullName': (f) => f.person.fullName(),
  'person.firstName': (f) => f.person.firstName(),
  'person.lastName': (f) => f.person.lastName(),
  'internet.email': (f) => f.internet.email({ provider: 'example.com' }).toLowerCase(),
  'internet.url': (f) => f.internet.url(),
  'internet.username': (f) => f.internet.username(),
  'phone.number': (f) => f.phone.number(),
  'location.city': (f) => f.location.city(),
  'location.country': (f) => f.location.country(),
  'location.streetAddress': (f) => f.location.streetAddress(),
  'company.name': (f) => f.company.name(),
  'commerce.productName': (f) => f.commerce.productName(),
  'commerce.department': (f) => f.commerce.department(),
  'commerce.price': (f, d) => Number(f.commerce.price({ min: d.min ?? 1, max: d.max ?? 1000 })),
  'lorem.words': (f) => f.lorem.words({ min: 2, max: 4 }),
  'lorem.sentence': (f) => f.lorem.sentence(),
  'lorem.paragraph': (f) => f.lorem.paragraph(),
  'string.uuid': (f) => f.string.uuid(),
  'date.past': (f) => f.date.past({ refDate: REF_DATE }).toISOString(),
  'date.future': (f) => f.date.future({ refDate: REF_DATE }).toISOString(),
  'date.birthdate': (f) => f.date.birthdate({ refDate: REF_DATE }).toISOString().slice(0, 10),
  'datatype.boolean': (f) => f.datatype.boolean(),
  'number.int': (f, d) => f.number.int({ min: d.min ?? 0, max: d.max ?? 1000 })
};

export function createFaker(seed: number): Faker {
  const f = new Faker({ locale: [en] });
  f.seed(seed);
  return f;
}
