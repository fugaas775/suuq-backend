import { ApiProperty } from '@nestjs/swagger';

export class PosCustomerDirectoryItemDto {
  @ApiProperty({ example: 'Amina Hassan', nullable: true })
  name!: string | null;

  @ApiProperty({ example: '0612345678', nullable: true })
  phoneNumber!: string | null;

  @ApiProperty({ example: 'EMP-204', nullable: true })
  reference!: string | null;

  @ApiProperty({
    example: '2026-06-12T10:00:00.000Z',
    nullable: true,
    description:
      'Most recent checkout occurrence for this customer in the branch.',
  })
  lastSeenAt!: string | null;
}

export class PosCustomerSearchResponseDto {
  @ApiProperty({ type: [PosCustomerDirectoryItemDto] })
  items!: PosCustomerDirectoryItemDto[];
}
