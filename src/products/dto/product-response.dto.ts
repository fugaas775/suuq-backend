export class VendorDto {
  id!: number;
  email!: string;
  displayName?: string;
  avatarUrl?: string;
  store_name?: string; // For frontend compatibility
  name?: string;       // For frontend compatibility
}

export class CategoryDto {
  id!: number;
  name!: string;
}

export class ProductResponseDto {
  id!: number;
  name!: string;
  price!: number;
  sale_price?: number;
  currency?: string;
  images!: { src: string }[];
  imageUrl?: string; // Derived, e.g. images[0]?.src
  description!: string;
  createdAt!: Date;
  featured!: boolean;
  vendor!: VendorDto;
  category?: CategoryDto;
  tags?: string[];
  average_rating?: number; // Prefer consistent type
  rating_count?: number;
}