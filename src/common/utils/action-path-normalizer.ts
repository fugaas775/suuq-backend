const ACTION_PATH_PREFIX_PATTERN = /^\/(admin|retail|hub)\//;

export function normalizeActionPath(path: string): string {
  if (!path || typeof path !== 'string') {
    return path;
  }

  if (/^https?:\/\//i.test(path) || path.startsWith('/api/')) {
    return path;
  }

  if (ACTION_PATH_PREFIX_PATTERN.test(path)) {
    return `/api${path}`;
  }

  return path;
}

export function normalizeActionResponsePaths<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeActionResponsePaths(entry)) as T;
  }

  if (!value || typeof value !== 'object' || value instanceof Date) {
    return value;
  }

  const entries = Object.entries(value as Record<string, unknown>).map(
    ([key, entryValue]) => {
      if (key === 'path' && typeof entryValue === 'string') {
        return [key, normalizeActionPath(entryValue)];
      }

      return [key, normalizeActionResponsePaths(entryValue)];
    },
  );

  return Object.fromEntries(entries) as T;
}
