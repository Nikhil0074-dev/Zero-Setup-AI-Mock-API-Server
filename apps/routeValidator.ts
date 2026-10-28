import type { EndpointDef, ValidationIssue } from '../../types';

const SEGMENT = /^(:[A-Za-z][A-Za-z0-9_]{0,30}|[A-Za-z0-9_.~-]+)$/;

export function isValidRoutePath(path: string): boolean {
  if (!path.startsWith('/') || path.includes('//')) return false;
  if (path === '/') return true;
  const segments = path.slice(1).split('/');
  return segments.every((s) => SEGMENT.test(s));
}

export function paramNames(path: string): string[] {
  return path
    .split('/')
    .filter((s) => s.startsWith(':'))
    .map((s) => s.slice(1));
}

/** Shape used to detect conflicts: parameters collapse to ":" so /a/:x and /a/:y clash, while /a/me and /a/:x do not. */
export function routeShape(method: string, path: string): string {
  return `${method} ${path.split('/').map((s) => (s.startsWith(':') ? ':' : s)).join('/')}`;
}

export function validateRoutes(endpoints: EndpointDef[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seenShapes = new Map<string, string>();
  const seenIds = new Set<string>();
  endpoints.forEach((ep, i) => {
    const at = `endpoints[${i}]`;
    if (seenIds.has(ep.id)) issues.push({ field: `${at}.id`, message: `Duplicate endpoint id "${ep.id}".` });
    seenIds.add(ep.id);
    if (!isValidRoutePath(ep.path)) {
      issues.push({ field: `${at}.path`, message: `Invalid route path "${ep.path}".` });
      return;
    }
    const names = paramNames(ep.path);
    if (new Set(names).size !== names.length) issues.push({ field: `${at}.path`, message: 'Duplicate path parameter names.' });
    const shape = routeShape(ep.method, ep.path);
    const prior = seenShapes.get(shape);
    if (prior) issues.push({ field: `${at}.path`, message: `Route conflicts with endpoint "${prior}" (${shape}).` });
    else seenShapes.set(shape, ep.id);
  });
  return issues;
}
