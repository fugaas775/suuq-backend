import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class UpdateBranchServiceFormatDto {
  @ApiProperty({
    description: 'Service format for the branch, e.g., RETAIL, QSR, FSR',
  })
  @IsNotEmpty()
  @IsString()
  serviceFormat!: string;
}
