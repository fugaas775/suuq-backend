import { Product } from '../entities/product.entity';

type RatingSummary = {
  average?: number;
  count?: number;
};

type PrimaryImage = {
  src?: string | null;
  thumbnail?: string | null;
  lowRes?: string | null;
};

export type ProductCard = {
  id: number;
  name: string;
  price: number;
  currency: string;
  primaryImage?: PrimaryImage;
  ratingSummary?: RatingSummary;
  categoryId?: number | null;
  listingType?: 'sale' | 'rent' | null;
  listingCity?: string | null;
  // Optional server-computed distance in kilometers
  distanceKm?: number;
  createdAt: string; // ISO string for client compatibility
  vendor?: {
    id: number;
    email: string; // some Flutter models require non-nullable strings
    displayName: string;
    avatarUrl: string;
    storeName: string;
    rating?: number | null;
    verified: boolean;
    subscriptionTier?: string;
    certificationStatus?: string;
    isCertified?: boolean;
    verificationStatus?: string;

    // Vendor tenure and location info for feed display
    registeredAt?: string;
    verifiedTenure?: string;
    country?: string | null;
  };
  // Dynamic info text for the card (e.g. "5 sold", "20% OFF", "New")
  infoText?: string | null;

  // Metrics for compact rows and guards
  viewCount?: number;
  salesCount?: number;

  // Explicit Type Flags
  isDigital?: boolean;
  isService?: boolean;
  isProperty?: boolean;
  productType?: string | null;

  // Digital
  downloadUrl?: string;
  format?: string;
  fileSizeMB?: number;
  licenseRequired?: boolean;
  isFree?: boolean;

  // Service
  deliveryMethod?: string;
  durationValue?: number;
  durationUnit?: string;
  fulfillmentText?: string;

  // Property
  rentPeriod?: string | null;
  priceUnit?: string | null; // Added: e.g. "M2", "Acre"
  viewingText?: string;
  bedrooms?: number | null;
  bathrooms?: number | null;
  sizeSqm?: number | null;
  furnished?: boolean | null;

  // Service
  servicePriceUnit?: string | null; // Added: e.g. "hour", "job"

  // Physical
  dispatchDays?: number | null;
  stock_quantity?: number;
  shippingCost?: number;
  shippingNotes?: string;
  moq?: number;

  feedType?: string;
};

function pruneNullish<T extends Record<string, any>>(obj: T): T {
  const out: any = Array.isArray(obj) ? [] : {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || typeof v === 'undefined') continue;
    if (Array.isArray(v))
      out[k] = v.map((it) =>
        typeof it === 'object' && it !== null ? pruneNullish(it) : it,
      );
    else if (v instanceof Date) out[k] = v.toISOString();
    else if (typeof v === 'object') out[k] = pruneNullish(v);
    else out[k] = v;
  }
  return out as T;
}

export function toProductCard(p: Product): ProductCard {
  const deriveVariant = (
    url: string | null | undefined,
    kind: 'thumb' | 'lowres',
  ): string | null => {
    if (!url || typeof url !== 'string') return null;
    // Common Spaces naming used by our media pipeline: full_*, thumb_*, lowres_*
    // Safest fallback: replace any known prefix with the requested one.
    const replaced = url
      .replace(/\/(full_)/, `/${kind}_`)
      .replace(/\/(thumb_)/, `/${kind}_`)
      .replace(/\/(lowres_)/, `/${kind}_`);
    // Only accept if something changed and the result still looks like a URL
    if (replaced !== url && /^https?:\/\//.test(replaced)) return replaced;
    return null;
  };

  const primary = (() => {
    const images = Array.isArray((p as any).images) ? (p as any).images : [];
    if (images.length) {
      const first = images[0];
      return {
        src: first?.src ?? (p as any).imageUrl ?? null,
        thumbnail:
          first?.thumbnailSrc ??
          deriveVariant(first?.src ?? (p as any).imageUrl, 'thumb'),
        lowRes:
          first?.lowResSrc ??
          deriveVariant(first?.src ?? (p as any).imageUrl, 'lowres'),
      } as PrimaryImage;
    }
    return (p as any).imageUrl
      ? ({
          src: (p as any).imageUrl,
          thumbnail: deriveVariant((p as any).imageUrl, 'thumb'),
          lowRes: deriveVariant((p as any).imageUrl, 'lowres'),
        } as PrimaryImage)
      : undefined;
  })();

  const vendor = (p as any).vendor as
    | {
        id: number;
        email?: string | null;
        displayName?: string | null;
        avatarUrl?: string | null;
        storeName?: string | null;
        rating?: number | null;
        verified?: boolean;
        subscriptionTier?: string;
        certificationStatus?: string;
        isCertified?: boolean;
        verificationStatus?: string;
        vendorPhoneNumber?: string | null;
        phoneNumber?: string | null;
        createdAt?: Date | string;
        verifiedAt?: Date | string;
        registrationCountry?: string | null;
      }
    | undefined;

  let verifiedTenure: string | undefined;
  if (vendor?.verified && vendor.verifiedAt) {
    const now = new Date();
    const start = new Date(vendor.verifiedAt);
    const diffMs = now.getTime() - start.getTime();
    if (diffMs > 0) {
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      if (diffDays < 30) {
        verifiedTenure = `${Math.max(0, diffDays)} Days`;
      } else if (diffDays < 365) {
        const m = Math.max(1, Math.floor(diffDays / 30.44));
        verifiedTenure = `${m} Month${m !== 1 ? 's' : ''}`;
      } else {
        verifiedTenure = (diffDays / 365.25).toFixed(1) + ' Years';
      }
    }
  }

  const card: ProductCard = {
    id: p.id,
    name: p.name,
    price: p.price,
    currency: p.currency,
    primaryImage: primary,
    ratingSummary:
      typeof (p as any).average_rating === 'number' ||
      typeof (p as any).rating_count === 'number'
        ? {
            average: (p as any).average_rating ?? undefined,
            count: (p as any).rating_count ?? undefined,
          }
        : undefined,
    categoryId: (p as any).category?.id ?? null,
    listingType: (p as any).listingType ?? null,
    listingCity: (p as any).listingCity ?? null,
    distanceKm: (p as any).distance_km ?? (p as any).distanceKm,
    createdAt:
      p.createdAt instanceof Date
        ? p.createdAt.toISOString()
        : typeof (p as any).createdAt === 'string'
          ? (p as any).createdAt
          : new Date().toISOString(),
    vendor: vendor
      ? {
          id: vendor.id,
          email: vendor.email ?? '',
          displayName: vendor.displayName ?? '',
          avatarUrl: vendor.avatarUrl ?? '',
          storeName: vendor.storeName ?? '',
          rating: vendor.rating ?? null,
          verified: !!vendor.verified,
          subscriptionTier: vendor.subscriptionTier || 'free',
          isCertified:
            vendor.isCertified ||
            !!vendor.verified ||
            vendor.verificationStatus === 'APPROVED',
          certificationStatus:
            vendor.certificationStatus ||
            (vendor.verified || vendor.verificationStatus === 'APPROVED'
              ? 'certified'
              : 'uncertified'),
          registeredAt:
            vendor.createdAt instanceof Date
              ? vendor.createdAt.toISOString()
              : typeof vendor.createdAt === 'string'
                ? vendor.createdAt
                : undefined,
          verifiedTenure,
          country: vendor.registrationCountry || undefined,
        }
      : undefined,
    infoText: (p as any).info_text ?? null,

    // Metrics
    viewCount: (p as any).viewCount || (p as any).view_count || 0,
    salesCount: (p as any).sales_count || 0,

    // Explicit Type Flags
    isDigital: p.isDigital,
    isService: p.isService,
    isProperty: p.isProperty,
    productType: p.productType,

    // Digital
    downloadUrl: p.downloadUrl,
    format: p.format,
    fileSizeMB: p.fileSizeMB,
    licenseRequired: p.licenseRequired,
    isFree: p.isFree,

    // Service
    deliveryMethod: p.deliveryMethod,
    durationValue: p.durationValue,
    durationUnit: p.durationUnit,
    fulfillmentText: p.fulfillmentText,
    servicePriceUnit: p.attributes?.servicePriceUnit, // Added

    // Property
    rentPeriod: p.rentPeriod, // specific to property
    priceUnit: p.attributes?.priceUnit, // Added
    viewingText: p.viewingText,
    bedrooms: p.bedrooms,
    bathrooms: p.bathrooms,
    sizeSqm: p.sizeSqm,
    furnished: p.furnished,

    // Physical
    dispatchDays: p.dispatchDays,
    stock_quantity: p.stock_quantity,
    shippingCost: p.shippingCost,
    shippingNotes: p.shippingNotes,
    moq: p.moq,

    feedType: (p as any).feedType,
  };

  return pruneNullish(card);
}
