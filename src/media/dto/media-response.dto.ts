import { ApiProperty } from '@nestjs/swagger';

export class MediaResponseDto {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: 'media/file-key-uuid.jpg' })
  key!: string;

  @ApiProperty({ example: 'https://domain.com/media/file-key-uuid.jpg' })
  src!: string;

  constructor(partial?: Partial<MediaResponseDto>) {
    if (partial) {
      this.id = partial.id ?? 0;
      this.key = partial.key ?? '';
      this.src = partial.src ?? '';
    }
  }
}
