export class VendorDto {
  id!: number;
  email!: string;
  displayName?: string;
  avatarUrl?: string;
  store_name?: string; // Add this for frontend compatibility
  name?: string;       // Add this for frontend compatibility
}

export class CategoryDto {
  id!: number;
  name!: string;
}

export class ProductResponseDto {
  id!: number;
  name!: string;
  price!: number; // Change to number
  sale_price?: number; // Add
  currency?: string;   // Add
  images!: { src: string }[]; // Add
  imageUrl?: string;   // Add (can be set to images[0]?.src)
  description!: string;
  createdAt!: Date;
  featured!: boolean;
  vendor!: VendorDto;
  category?: CategoryDto;
  tags?: string[];
  average_rating?: number | string; // Add
  rating_count?: number;            // Add
}
