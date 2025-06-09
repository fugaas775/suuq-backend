import {
  Controller,
  Post,
  Get,
  Patch,
  Param,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
  UseGuards,
  UnauthorizedException,
  BadRequestException,
  Body,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { MediaService } from './media.service';
import { MediaResponseDto } from './dto/media-response.dto';
import { createMulterStorage } from './createMulterStorage';
import { MediaEntity } from './entities/media.entity';
import { AuthenticatedRequest } from 'common/interfaces/authenticated-request.interface';
import { Public } from 'common/decorators/public.decorator';
import { UserRole } from 'auth/roles.enum'; 
import { Roles } from '../common/decorators/roles.decorator';

@Controller('suuq/v1/media')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post()
  @Roles(UserRole.VENDOR, UserRole.ADMIN) // ✅ use enum values
  @UseInterceptors(FileInterceptor('file', createMulterStorage('products')))
async upload(
  @UploadedFile() file: Express.Multer.File,
  @Req() req: AuthenticatedRequest,
  @Query('type') type: string = 'product',
): Promise<MediaResponseDto> {
    if (!req.user) throw new UnauthorizedException('User not authenticated');
    if (!file) throw new BadRequestException('No file uploaded');

    const media = await this.mediaService.saveFile(file, req.user.id, type);

    return new MediaResponseDto({
      id: media.id,
      key: media.key,
      src: media.src,
    });
  }

  @Get('my')
  async getMyMedia(
    @Req() req: AuthenticatedRequest,
    @Query('page') page = 1,
    @Query('limit') limit = 10,
    @Query('sortBy') sortBy = 'createdAt',
    @Query('order') order: 'ASC' | 'DESC' = 'DESC',
    @Query('type') type?: string,
  ) {
    if (!req.user) throw new UnauthorizedException();
    return this.mediaService.findPaginatedByOwner(
      req.user.id,
      Number(page),
      Number(limit),
      sortBy,
      order,
      type,
    );
  }

  @Get(':id')
  @Public()
  async getMediaById(@Param('id') id: number): Promise<MediaEntity> {
    const media = await this.mediaService.findOneById(id);
    if (!media) throw new UnauthorizedException('Media not found');
    return media;
  }

  @Patch(':id')
  async updateMedia(
    @Param('id') id: number,
    @Req() req: AuthenticatedRequest,
    @Body() body: { caption?: string; altText?: string },
  ): Promise<MediaEntity> {
    if (!req.user) throw new UnauthorizedException();
    return this.mediaService.update(id, body, req.user.id);
  }
}
