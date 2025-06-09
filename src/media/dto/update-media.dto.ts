import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateMediaDto {
  @ApiPropertyOptional({ example: 'Updated caption' })
  caption?: string;

  @ApiPropertyOptional({ example: 'Descriptive alt text for accessibility' })
  altText?: string;

  @ApiPropertyOptional({ example: 'product' })
  type?: string;
}
