import { Product } from './product.entity';

describe('Product listedBy attribution', () => {
  it('returns staff attribution when createdByName is present', () => {
    const p = new Product();
    p.createdById = 42;
    p.createdByName = 'Vendor Staff';
    p.vendor = {
      id: 7,
      storeName: 'Owner Store',
      displayName: 'Owner',
    } as any;

    expect(p.listedBy).toEqual({
      name: 'Vendor Staff',
      type: 'staff',
      id: 42,
    });
  });

  it('returns guest attribution when originalCreatorContact is set', () => {
    const p = new Product();
    p.originalCreatorContact = { name: 'Guest Poster' };
    p.createdById = 42;
    p.createdByName = 'Vendor Staff';
    p.vendor = {
      id: 7,
      storeName: 'Owner Store',
      displayName: 'Owner',
    } as any;

    expect(p.listedBy).toEqual({
      name: 'Guest Poster',
      type: 'guest',
      id: null,
    });
  });

  it('falls back to store attribution when no explicit creator exists', () => {
    const p = new Product();
    p.vendor = {
      id: 7,
      storeName: 'Owner Store',
      displayName: 'Owner',
    } as any;

    expect(p.listedBy).toEqual({
      name: 'Owner Store',
      type: 'store',
      id: 7,
    });
  });
});
