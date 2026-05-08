import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class UpdateBranchServiceFormatDto {
  @ApiProperty({
    description: 'Service format for the branch, e.g., RETAIL or HOTEL',
  })
  @IsNotEmpty()
  @IsString()
  serviceFormat!: string;
}
