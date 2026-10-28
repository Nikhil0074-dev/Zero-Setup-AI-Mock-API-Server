import { HttpError } from '../../utils/errors';

export interface RouteSegment {
  param: boolean;
  value: string;
}

export interface CompiledRoute {
  segments: RouteSegment[];
  staticCount: number;
}

export function splitPath(path: string): string[] {
  const noQuery = path.split('?')[0]!;
  return noQuery.split('/').filter((s) => s.length > 0);
}

export function compileRoute(fullPath: string): CompiledRoute {
  const segments = splitPath(fullPath).map((s) => (s.startsWith(':') ? { param: true, value: s.slice(1) } : { param: false, value: s }));
  return { segments, staticCount: segments.filter((s) => !s.param).length };
}

function decode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    throw new HttpError(400, 'BAD_REQUEST', 'The request path contains invalid percent-encoding.');
  }
}

/** Returns extracted path parameters (in order) when the route matches, otherwise null. */
export function matchRoute(route: CompiledRoute, pathSegments: string[]): Record<string, string> | null {
  if (route.segments.length !== pathSegments.length) return null;
  const params: Record<string, string> = Object.create(null) as Record<string, string>;
  for (let i = 0; i < route.segments.length; i++) {
    const seg = route.segments[i]!;
    const actual = pathSegments[i]!;
    if (seg.param) params[seg.value] = decode(actual);
    else if (seg.value !== actual) return null;
  }
  return params;
}
