import { toProductCard } from './product-card.util';

describe('toProductCard', () => {
  it('serializes createdAt as ISO string and defaults vendor string fields', () => {
    const created = new Date('2024-08-15T12:34:56.000Z');
    const product: any = {
      id: 123,
      name: 'Test Product',
      price: 99.99,
      currency: 'ETB',
      createdAt: created,
      vendor: {
        id: 7,
        email: null,
        displayName: undefined,
        avatarUrl: null,
        storeName: undefined,
        verified: true,
        rating: null,
      },
    };

    const card = toProductCard(product);

    // createdAt must be a string in ISO format
    expect(typeof card.createdAt).toBe('string');
    expect(card.createdAt).toBe(created.toISOString());

    // vendor should be present and string fields should be non-null strings
    expect(card.vendor).toBeDefined();
    expect(card.vendor?.id).toBe(7);
    expect(card.vendor?.email).toBe('');
    expect(card.vendor?.displayName).toBe('');
    expect(card.vendor?.avatarUrl).toBe('');
    expect(card.vendor?.storeName).toBe('');
    // rating can be null or omitted; verified must be boolean
    expect(card.vendor?.verified).toBe(true);
  });

  it('derives thumbnail and lowRes from full_* URL when variants are not present', () => {
    const product: any = {
      id: 1,
      name: 'Img',
      price: 0,
      currency: 'ETB',
      createdAt: new Date('2024-08-15T12:34:56.000Z'),
      images: [
        {
          src: 'https://suuq-media.ams3.digitaloceanspaces.com/full_1758197584274_1000006882.png',
        },
      ],
      vendor: { id: 1 },
    };
    const card = toProductCard(product);
    expect(card.primaryImage?.src).toContain('/full_');
    // Derivation is heuristic; ensure a non-empty string exists
    expect(typeof card.primaryImage?.thumbnail).toBe('string');
    expect(card.primaryImage?.thumbnail).toContain('/thumb_');
    expect(typeof card.primaryImage?.lowRes).toBe('string');
    expect(card.primaryImage?.lowRes).toContain('/lowres_');
  });
});
