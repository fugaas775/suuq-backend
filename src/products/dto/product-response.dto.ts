export class VendorDto {
  id!: number;
  email!: string;
  displayName?: string;
  avatarUrl?: string;
}

export class CategoryDto {
  id!: number;
  name!: string;
}

export class ProductResponseDto {
  id!: number;
  name!: string;
  price!: string;
  description!: string;
  createdAt!: Date;
  featured!: boolean;
  vendor!: VendorDto;
  category?: CategoryDto;
  tags?: string[];
}

