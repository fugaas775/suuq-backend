import { ApiProperty } from '@nestjs/swagger';
import { CreateMediaDto } from './create-media.dto';

export class BulkMediaDto {
  @ApiProperty({ type: [CreateMediaDto] })
  media!: CreateMediaDto[];

  constructor(partial?: Partial<BulkMediaDto>) {
    this.media = partial?.media?.map((m) => new CreateMediaDto(m)) ?? [];
  }
}
