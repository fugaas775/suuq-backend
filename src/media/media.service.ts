import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { MediaEntity } from './media.entity';
import { Express } from 'express'; // Multer file type
import { CreateMediaDto } from './dto/create-media.dto';
import { UpdateMediaDto } from './dto/update-media.dto';
import { BulkMediaDto } from './dto/bulk-media.dto';

@Injectable()
export class MediaService {
  constructor(
    @InjectRepository(MediaEntity)
    private readonly mediaRepo: Repository<MediaEntity>,
  ) {}

  async saveFile(file: Express.Multer.File, ownerId: number): Promise<MediaEntity> {
    const media = this.mediaRepo.create({
      key: (file as any).key,
      src: (file as any).location,
      mimeType: file.mimetype,
      fileName: file.originalname,
      ownerId,
    });
    return this.mediaRepo.save(media);
  }

  async create(dto: CreateMediaDto): Promise<MediaEntity> {
    const media = this.mediaRepo.create(dto);
    return this.mediaRepo.save(media);
  }

  async bulkCreate(dto: BulkMediaDto): Promise<MediaEntity[]> {
    const entities = dto.media.map(m => this.mediaRepo.create(m));
    return this.mediaRepo.save(entities);
  }

  async update(id: number, dto: UpdateMediaDto, userId: number): Promise<MediaEntity> {
    const media = await this.mediaRepo.findOne({ where: { id } });
    if (!media) throw new NotFoundException('Media not found');
    if (media.ownerId !== userId) throw new ForbiddenException('Not owner');
    Object.assign(media, dto);
    return this.mediaRepo.save(media);
  }

  async deleteByKey(key: string, userId: number): Promise<boolean> {
    const media = await this.mediaRepo.findOne({
      where: { key, ownerId: userId },
    });
    if (!media) throw new NotFoundException('Media not found or not owned by user');
    await this.mediaRepo.remove(media);
    return true;
  }

  async findByOwner(ownerId: number): Promise<MediaEntity[]> {
    return this.mediaRepo.find({ where: { ownerId } });
  }

  async findOneById(id: number, userId?: number): Promise<MediaEntity | null> {
    const where = userId ? { id, ownerId: userId } : { id };
    return this.mediaRepo.findOne({ where });
  }

  async findManyByIds(ids: number[], userId?: number): Promise<MediaEntity[]> {
    const where = userId
      ? { id: In(ids), ownerId: userId }
      : { id: In(ids) };
    return this.mediaRepo.find({ where });
  }
}