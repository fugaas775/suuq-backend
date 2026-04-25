import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsEnum } from 'class-validator';
import { SupplierStaffRole } from '../entities/supplier-staff-assignment.entity';

export class AssignSupplierStaffDto {
  @ApiProperty({
    description: 'Email of an existing platform user to add as supplier staff.',
  })
  @IsEmail()
  email!: string;

  @ApiProperty({ enum: SupplierStaffRole })
  @IsEnum(SupplierStaffRole)
  role!: SupplierStaffRole;
}
