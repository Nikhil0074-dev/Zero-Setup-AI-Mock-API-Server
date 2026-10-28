import type { FieldDef } from '../../types';
import type { AiProvider, AiRequest } from './aiClient';

type Tpl = { singular: string; idPrefix: string; fields: Record<string, FieldDef>; filterable?: string[]; sortable?: string[] };
const f = (type: FieldDef['type'], extra: Partial<FieldDef> = {}): FieldDef => ({ type, ...extra });

const TEMPLATES: Record<string, Tpl> = {
  students: { singular: 'student', idPrefix: 'stu', fields: {
    name: f('string', { required: true, faker: 'person.fullName' }), email: f('string', { required: true, format: 'email' }),
    department: f('string', { required: true, enum: ['Computer Science', 'Information Technology', 'Mechanical', 'Electronics', 'Civil'] }),
    year: f('integer', { required: true, min: 1, max: 4 }) }, filterable: ['department', 'year'] },
  users: { singular: 'user', idPrefix: 'usr', fields: {
    name: f('string', { required: true, faker: 'person.fullName' }), email: f('string', { required: true, format: 'email' }),
    role: f('string', { enum: ['customer', 'admin', 'support'] }), active: f('boolean') }, filterable: ['role', 'active'] },
  customers: { singular: 'customer', idPrefix: 'cus', fields: {
    name: f('string', { required: true, faker: 'person.fullName' }), email: f('string', { required: true, format: 'email' }),
    phone: f('string', { faker: 'phone.number' }), city: f('string', { faker: 'location.city' }) }, filterable: ['city'] },
  products: { singular: 'product', idPrefix: 'prod', fields: {
    name: f('string', { required: true, faker: 'commerce.productName' }),
    category: f('string', { required: true, enum: ['electronics', 'books', 'home', 'fashion', 'sports'] }),
    price: f('number', { required: true, min: 1, max: 5000, faker: 'commerce.price' }), inStock: f('boolean'),
    description: f('string', { faker: 'lorem.sentence' }) }, filterable: ['category', 'inStock'], sortable: ['name', 'price'] },
  orders: { singular: 'order', idPrefix: 'ord', fields: {
    userId: f('string', { required: true }), total: f('number', { required: true, min: 0, max: 10000 }),
    status: f('string', { enum: ['pending', 'paid', 'shipped', 'delivered', 'cancelled'] }) }, filterable: ['status', 'userId'] },
  books: { singular: 'book', idPrefix: 'book', fields: {
    title: f('string', { required: true, faker: 'lorem.words' }), author: f('string', { required: true, faker: 'person.fullName' }),
    genre: f('string', { enum: ['fiction', 'science', 'history', 'biography', 'fantasy'] }),
    year: f('integer', { min: 1900, max: 2026 }), available: f('boolean') }, filterable: ['genre', 'available', 'year'] },
  authors: { singular: 'author', idPrefix: 'aut', fields: {
    name: f('string', { required: true, faker: 'person.fullName' }), country: f('string', { faker: 'location.country' }),
    born: f('string', { format: 'date', faker: 'date.birthdate' }) }, filterable: ['country'] },
  employees: { singular: 'employee', idPrefix: 'emp', fields: {
    name: f('string', { required: true, faker: 'person.fullName' }), email: f('string', { required: true, format: 'email' }),
    department: f('string', { enum: ['Engineering', 'Sales', 'HR', 'Finance', 'Support'] }),
    salary: f('integer', { min: 30000, max: 250000 }) }, filterable: ['department'], sortable: ['name', 'salary'] },
  tasks: { singular: 'task', idPrefix: 'task', fields: {
    title: f('string', { required: true, faker: 'lorem.sentence', maxLength: 80 }), status: f('string', { enum: ['todo', 'in_progress', 'done'] }),
    priority: f('integer', { min: 1, max: 5 }), done: f('boolean') }, filterable: ['status', 'priority', 'done'] },
  posts: { singular: 'post', idPrefix: 'post', fields: {
    title: f('string', { required: true, faker: 'lorem.sentence', maxLength: 100 }), body: f('string', { faker: 'lorem.paragraph' }),
    author: f('string', { faker: 'person.fullName' }), published: f('boolean') }, filterable: ['published', 'author'] },
  courses: { singular: 'course', idPrefix: 'crs', fields: {
    title: f('string', { required: true, faker: 'lorem.words' }), instructor: f('string', { faker: 'person.fullName' }),
    credits: f('integer', { min: 1, max: 6 }), level: f('string', { enum: ['beginner', 'intermediate', 'advanced'] }) }, filterable: ['level', 'credits'] },
  movies: { singular: 'movie', idPrefix: 'mov', fields: {
    title: f('string', { required: true, faker: 'lorem.words' }), genre: f('string', { enum: ['drama', 'comedy', 'thriller', 'sci-fi'] }),
    rating: f('number', { min: 1, max: 10 }), year: f('integer', { min: 1950, max: 2026 }) }, filterable: ['genre', 'year'] }
};

const title = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Offline, deterministic fallback used when no AI key is configured: recognises common resource names in the
 * description and emits the same declarative JSON a model would. It is template-based, not a language model.
 */
export class RuleBasedProvider implements AiProvider {
  readonly name = 'rule-based';

  async generate({ user }: AiRequest): Promise<string> {
    const text = user.toLowerCase();
    const nameLine = /^API name: (.+)$/m.exec(user)?.[1]?.trim();
    const found = Object.entries(TEMPLATES)
      .map(([plural, t]) => ({ plural, t, idx: text.search(new RegExp(`\\b(${plural}|${t.singular})\\b`)) }))
      .filter((x) => x.idx >= 0)
      .sort((a, b) => a.idx - b.idx)
      .slice(0, 6);
    if (found.length === 0)
      found.push({ plural: 'items', idx: 0, t: { singular: 'item', idPrefix: 'item', fields: {
        name: f('string', { required: true, faker: 'commerce.productName' }), description: f('string', { faker: 'lorem.sentence' }),
        status: f('string', { enum: ['active', 'archived'] }) }, filterable: ['status'] } });

    const readOnly = /read[- ]only|only (?:list|read|get)/.test(text);
    const resources: Record<string, unknown> = {};
    const endpoints: Array<Record<string, unknown>> = [];
    for (const { plural, t } of found) {
      const fields = structuredClone(t.fields);
      if (plural === 'orders' && found.some((x) => x.plural === 'users')) fields.userId = f('string', { required: true, enum: ['usr_101', 'usr_102', 'usr_103', 'usr_104', 'usr_105'] });
      resources[plural] = { idPrefix: t.idPrefix, seedCount: 12, fields, filterable: t.filterable, sortable: t.sortable };
      const P = title(plural);
      endpoints.push({ id: `list-${plural}`, method: 'GET', path: `/${plural}`, behavior: 'list', resource: plural, summary: `List ${plural}` });
      endpoints.push({ id: `get-${t.singular}`, method: 'GET', path: `/${plural}/:id`, behavior: 'getById', resource: plural, summary: `Get one ${t.singular}` });
      if (!readOnly) {
        endpoints.push({ id: `create-${t.singular}`, method: 'POST', path: `/${plural}`, behavior: 'create', resource: plural, summary: `Create a ${t.singular}` });
        endpoints.push({ id: `update-${t.singular}`, method: 'PATCH', path: `/${plural}/:id`, behavior: 'update', resource: plural, summary: `Update a ${t.singular}` });
        endpoints.push({ id: `delete-${t.singular}`, method: 'DELETE', path: `/${plural}/:id`, behavior: 'delete', resource: plural, summary: `Delete a ${t.singular}` });
      }
      void P;
    }
    if (resources.users && resources.orders)
      endpoints.push({ id: 'list-user-orders', method: 'GET', path: '/users/:userId/orders', behavior: 'list', resource: 'orders', scope: { param: 'userId', field: 'userId' }, summary: "List a user's orders" });
    if (/\b(login|log in|sign in|authenticat)/.test(text))
      endpoints.push({ id: 'login', method: 'POST', path: '/auth/login', behavior: 'static', summary: 'Simulated login',
        requestSchema: { type: 'object', required: ['email', 'password'], properties: { email: { type: 'string', format: 'email' }, password: { type: 'string', minLength: 1 } }, additionalProperties: false },
        response: { status: 200, body: { token: 'mock-token', tokenType: 'Bearer', expiresIn: 3600 } } });

    const name = nameLine || `${title(found[0]!.plural)} API`;
    return JSON.stringify({ name, description: user.split('Requirements:\n')[1]?.slice(0, 300) ?? '', version: '1.0.0', apiType: 'REST', basePath: '/api', resources, endpoints });
  }
}
