// src/common/utils/translation.util.ts

/**
 * Updates entity properties with values from a translation map if a matching locale is found.
 *
 * @param entity The entity object (e.g. valid Category or Country)
 * @param lang The language code (e.g. 'en', 'am', 'so-KE')
 * @param fields Mapping of targetField -> sourceTranslationField (e.g. { name: 'nameTranslations' })
 */
export function translateEntity<T>(
  entity: T,
  lang: string,
  fields: Partial<Record<keyof T, keyof T>>,
): T {
  if (!entity || !lang || lang.startsWith('en')) {
    return entity;
  }

  // Normalize lang (e.g. 'so-KE' -> 'so')
  const locale = lang.split('-')[0].toLowerCase();

  for (const [targetField, translationField] of Object.entries(fields)) {
    const translations = entity[translationField as keyof T] as
      | Record<string, string>
      | undefined;
    if (translations && translations[locale]) {
      (entity as any)[targetField] = translations[locale];
    }
  }

  return entity;
}

/**
 * Translates an array of entities
 */
export function translateEntities<T>(
  entities: T[],
  lang: string,
  fields: Partial<Record<keyof T, keyof T>>,
): T[] {
  if (!entities) return [];
  if (!lang || lang.startsWith('en')) return entities;
  return entities.map((e) => translateEntity(e, lang, fields));
}
