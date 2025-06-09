export class CreateCategoryDto {
  name!: string;
  slug!: string;
  iconUrl?: string;
  iconName?: string;
  parentId?: number;
}