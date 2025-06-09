import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateMediaDto {
  @ApiProperty({ example: 'image/jpeg' })
  mimeType!: string;

  @ApiProperty({ example: 'photo.jpg' })
  fileName!: string;

  @ApiPropertyOptional({ example: 'product', default: 'product' })
  type?: string;

  @ApiPropertyOptional({ example: 'Cover photo for profile' })
  caption?: string;

  @ApiPropertyOptional({ example: 'A smiling person holding a coffee' })
  altText?: string;

  constructor(partial?: Partial<CreateMediaDto>) {
    if (partial) {
      this.mimeType = partial.mimeType ?? '';
      this.fileName = partial.fileName ?? '';
      this.type = partial.type;
      this.caption = partial.caption;
      this.altText = partial.altText;
    }
  }
}
