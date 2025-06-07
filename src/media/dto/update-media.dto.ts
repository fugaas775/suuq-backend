import { PartialType } from '@nestjs/swagger';
import { CreateMediaDto } from './create-media.dto';

export class UpdateMediaDto extends PartialType(CreateMediaDto) {
  constructor(partial?: Partial<UpdateMediaDto>) {
    super(partial);
    // All fields optional, inherited from CreateMediaDto
  }
}
