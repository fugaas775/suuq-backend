export class ReviewResponseDto {
  id!: number;
  rating!: number;
  comment!: string;
  createdAt!: Date;
  updatedAt!: Date;
  user?: {
    id: number;
    displayName: string;
    avatarUrl?: string;
  }
}