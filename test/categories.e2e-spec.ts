import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { CategoriesController } from '../src/categories/categories.controller';
import { CategoriesService } from '../src/categories/categories.service';

describe('Categories (e2e)', () => {
  let app: INestApplication;

  const mockCategories = [
    { id: 1, name: 'Shoes', slug: 'shoes', sortOrder: 1 },
    { id: 2, name: 'Bags', slug: 'bags', sortOrder: 2 },
  ];

  const childUpdated = new Date('2025-01-01T00:00:00.000Z');
  const rootUpdated = new Date('2025-02-01T00:00:00.000Z');

  const rootsWithChildren = [
    {
      id: 10,
      name: 'Root',
      slug: 'root',
      updatedAt: rootUpdated,
      children: [
        { id: 11, name: 'Child', slug: 'child', updatedAt: childUpdated },
      ],
    },
  ];

  const findAllMock = jest
    .fn<Promise<any[]>, [number]>()
    .mockImplementation(async (_perPage) => mockCategories);
  const findRootsMock = jest
    .fn<Promise<any[]>, []>()
    .mockResolvedValue(rootsWithChildren as any);
  const findBySlugMock = jest
    .fn<Promise<any>, [string]>()
    .mockImplementation(
      async (slug) => mockCategories.find((c) => c.slug === slug) || null,
    );
  const suggestMock = jest
    .fn<
      Promise<
        Array<{
          id: number;
          name: string;
          slug: string;
          parentId: number | null;
        }>
      >,
      [string, number]
    >()
    .mockResolvedValue([
      { id: 1, name: 'Shoes', slug: 'shoes', parentId: null },
      { id: 2, name: 'Bags', slug: 'bags', parentId: null },
    ]);

  const mockService: Partial<CategoriesService> = {
    findAll: findAllMock as any,
    findRoots: findRootsMock as any,
    findBySlug: findBySlugMock as any,
    suggest: suggestMock as any,
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [CategoriesController],
      providers: [
        {
          provide: CategoriesService,
          useValue: mockService,
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('GET /api/categories', () => {
    it('caps per_page and sets cache headers', async () => {
      // Call with very large per_page to verify cap at 200
      const res = await request(app.getHttpServer())
        .get('/api/categories?per_page=1000')
        .expect(200);

      // Service should receive capped value 200
      expect(findAllMock).toHaveBeenCalledTimes(1);
      expect(findAllMock).toHaveBeenCalledWith(200, 'en');

      // Headers
      expect(res.headers['cache-control']).toBe('public, max-age=60');

      // Body
      expect(res.body).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: 1, slug: 'shoes' }),
          expect.objectContaining({ id: 2, slug: 'bags' }),
        ]),
      );
    });
  });

  describe('GET /api/categories/tree', () => {
    it('returns tree with cache and last-modified headers', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/categories/tree')
        .expect(200);

      // Cache header (5 minutes)
      expect(res.headers['cache-control']).toBe('public, max-age=300');

      // Last-Modified equals latest of rootUpdated and childUpdated
      const expected = new Date(
        Math.max(rootUpdated.getTime(), childUpdated.getTime()),
      ).toUTCString();
      expect(res.headers['last-modified']).toBe(expected);

      // Body mirrors mock
      expect(res.body).toEqual(
        expect.arrayContaining([expect.objectContaining({ slug: 'root' })]),
      );
    });

    it('HEAD sets headers without body', async () => {
      const res = await request(app.getHttpServer())
        .head('/api/categories/tree')
        .expect(200);

      expect(res.headers['cache-control']).toBe('public, max-age=300');
      expect(res.headers['last-modified']).toBeDefined();
      // supertest sets res.text to undefined for HEAD; ensure no JSON body
      expect(res.text === undefined || res.text === '').toBe(true);
    });
  });

  describe('GET /api/categories/by-slug/:slug', () => {
    it('returns a category when found', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/categories/by-slug/shoes')
        .expect(200);
      expect(res.body).toEqual(expect.objectContaining({ slug: 'shoes' }));
    });

    it('returns null-ish when not found', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/categories/by-slug/does-not-exist')
        .expect(200);
      const isNullish =
        res.body === null ||
        (res.body &&
          typeof res.body === 'object' &&
          Object.keys(res.body).length === 0);
      expect(isNullish).toBe(true);
    });
  });

  describe('GET /api/categories/suggest', () => {
    it('returns lightweight suggestions', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/categories/suggest?q=sh&limit=5')
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body[0]).toEqual(
        expect.objectContaining({ slug: 'shoes', parentId: null }),
      );
    });
  });
});
