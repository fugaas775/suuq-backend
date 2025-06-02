import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MediaEntity } from './media.entity';
import { Express } from 'express'; // ✅ THIS is the correct source for Multer file type
import { User } from '../users/user.entity';

@Injectable()
export class MediaService {
  constructor(
    @InjectRepository(MediaEntity)
    private readonly mediaRepo: Repository<MediaEntity>,
  ) {}

  async saveFile(file: Express.Multer.File, ownerId: number) {
    const media = this.mediaRepo.create({
      key: (file as any).key, // OR make sure type is Express.Multer.File
      src: (file as any).location,
      mimeType: file.mimetype,
      fileName: file.originalname,
      ownerId,
    });

    return this.mediaRepo.save(media);
  }

  async deleteByKey(key: string, userId: number): Promise<boolean> {
    const media = await this.mediaRepo.findOne({
      where: { key, ownerId: userId },
    });

    if (!media) {
      throw new Error('Media not found or not owned by user');
    }

    await this.mediaRepo.remove(media);
    return true;
  }
}
