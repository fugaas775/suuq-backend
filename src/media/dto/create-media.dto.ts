import { ApiProperty } from '@nestjs/swagger';

export class CreateMediaDto {
  @ApiProperty({ example: 'media/file-key-uuid.jpg' })
  key!: string;

  @ApiProperty({ example: 'https://domain.com/media/file-key-uuid.jpg' })
  src!: string;

  @ApiProperty({ example: 'image/jpeg' })
  mimeType!: string;

  @ApiProperty({ example: 'photo.jpg' })
  fileName!: string;

  @ApiProperty({ example: 1 })
  ownerId!: number;

  constructor(partial?: Partial<CreateMediaDto>) {
    if (partial) {
      this.key = partial.key ?? '';
      this.src = partial.src ?? '';
      this.mimeType = partial.mimeType ?? '';
      this.fileName = partial.fileName ?? '';
      this.ownerId = partial.ownerId ?? 0;
    }
  }
}
