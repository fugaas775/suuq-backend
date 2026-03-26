const toArray = (value: unknown): unknown[] => {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  if (value == null || value === '') {
    return [];
  }

  return [value];
};

export const toValidatedPositiveIntArray = ({
  value,
}: {
  value: unknown;
}): number[] | undefined => {
  const values = toArray(value);
  if (values.length === 0) {
    return undefined;
  }

  return values.map((item) => Number(item));
};

export const toValidatedEnumArray =
  <T extends string>() =>
  ({ value }: { value: unknown }): T[] | undefined => {
    const values = toArray(value);
    if (values.length === 0) {
      return undefined;
    }

    return values.map((item) => String(item).trim().toUpperCase() as T);
  };

export const toValidatedOptionalDate = ({
  value,
}: {
  value: unknown;
}): Date | undefined => {
  if (value == null || value === '') {
    return undefined;
  }

  return value instanceof Date ? value : new Date(String(value));
};
