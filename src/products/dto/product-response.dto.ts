export class VendorDto {
  id!: number;
  email!: string;
  displayName?: string;
  avatarUrl?: string;
  store_name?: string;
  name?: string;
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
  imageUrl?: string;
  description!: string;
  createdAt!: Date;
  featured!: boolean;
  vendor!: VendorDto;
  category?: CategoryDto;
  tags?: string[];
  average_rating?: number;
  rating_count?: number;
  sku?: string;
  stock_quantity?: number;
  manage_stock?: boolean;
  status?: 'publish' | 'draft' | 'pending';
}