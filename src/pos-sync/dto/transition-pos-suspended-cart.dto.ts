import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber } from 'class-validator';

export class TransitionPosSuspendedCartDto {
  @ApiProperty({ example: 4 })
  @Type(() => Number)
  @IsNumber()
  branchId!: number;
}
