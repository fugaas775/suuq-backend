// src/categories/dto/create-category.dto.ts
export class CreateCategoryDto {
  name!: string;
  slug!: string;
  iconUrl?: string;
  parentId?: number;
}
