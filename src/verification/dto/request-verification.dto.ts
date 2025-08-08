import {
  IsArray,
  IsUrl,
  ValidateNested,
  IsNotEmpty,
  IsString,
} from 'class-validator';
import { Type } from 'class-transformer';

class VerificationDocumentDto {
  @IsUrl()
  @IsNotEmpty()
  url: string;

  @IsString()
  @IsNotEmpty()
  name: string;
}

export class RequestVerificationDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VerificationDocumentDto)
  documents: VerificationDocumentDto[];
}
