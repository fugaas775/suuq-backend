import {
  Controller,
  Post,
  Req,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../auth/roles.enum';
import { UsersService } from '../users/users.service';
import {
  VerificationStatus,
  VerificationDocument,
} from '../users/entities/user.entity';
import { DoSpacesService } from '../media/do-spaces.service';

@Controller('verification')
export class VerificationController {
  constructor(
    private readonly usersService: UsersService,
    private readonly doSpacesService: DoSpacesService,
  ) {}

  @Post('request')
  @UseGuards(JwtAuthGuard)
  @Roles(UserRole.VENDOR, UserRole.DELIVERER)
  @UseInterceptors(FilesInterceptor('documents'))
  async requestVerification(
    @UploadedFiles(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 1024 * 1024 * 10 }), // 10MB
          new FileTypeValidator({
            fileType: '.(png|jpeg|jpg|pdf|doc|docx)',
          }),
        ],
      }),
    )
    files: Express.Multer.File[],
    @Req() req,
  ) {
    const userId = req.user.id;
    const verificationDocuments: VerificationDocument[] = [];

    for (const file of files) {
      const url = await this.doSpacesService.uploadFile(
        file.buffer,
        `verification/${userId}/${Date.now()}_${file.originalname}`,
        file.mimetype,
      );
      verificationDocuments.push({
        url,
        name: file.originalname,
      });
    }

    await this.usersService.update(userId, {
      verificationStatus: VerificationStatus.PENDING,
      verificationDocuments,
    });

    return { message: 'Verification request submitted successfully.' };
  }
}
