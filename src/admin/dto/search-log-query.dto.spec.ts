import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { SearchLogQueryDto } from './search-log-query.dto';

const validateDto = <T extends object>(cls: new () => T, input: object) => {
  const instance = plainToInstance(cls, input);
  const errors = validateSync(instance as object);

  return { instance, errors };
};

const errorProperties = (errors: { property: string }[]) =>
  errors.map((error) => error.property);

describe('SearchLogQueryDto', () => {
  it('transforms valid admin search-log filters', () => {
    const { instance, errors } = validateDto(SearchLogQueryDto, {
      q: '  coffee beans  ',
      source: '  mobile  ',
      limit: '150',
    });

    expect(errors).toHaveLength(0);
    expect(instance).toEqual(
      expect.objectContaining({
        q: 'coffee beans',
        source: 'mobile',
        limit: 150,
      }),
    );
  });

  it('rejects malformed admin search-log filters', () => {
    const { errors } = validateDto(SearchLogQueryDto, {
      limit: 'abc',
    });

    expect(errorProperties(errors)).toEqual(expect.arrayContaining(['limit']));
  });
});
