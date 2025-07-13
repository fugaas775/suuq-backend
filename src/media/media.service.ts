import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { MediaEntity } from './entities/media.entity';
import { Express } from 'express';
import { CreateMediaDto } from './dto/create-media.dto';
import { UpdateMediaDto } from './dto/update-media.dto';
import { BulkMediaDto } from './dto/bulk-media.dto';
import { v4 as uuidv4 } from 'uuid';
import sharp from 'sharp'; // ✅ FIXED import
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';



@Injectable()
export class MediaService {
  private readonly s3Client: S3Client;
  private readonly bucket: string;

  constructor(
    @InjectRepository(MediaEntity)
    private readonly mediaRepo: Repository<MediaEntity>,
    private readonly configService: ConfigService,
  ) {
    this.bucket = this.configService.getOrThrow<string>('DO_SPACES_BUCKET');
    this.s3Client = new S3Client({
      credentials: {
        accessKeyId: this.configService.getOrThrow<string>('DO_SPACES_KEY'),
        secretAccessKey: this.configService.getOrThrow<string>('DO_SPACES_SECRET'),
      },
      endpoint: this.configService.getOrThrow<string>('DO_SPACES_ENDPOINT'),
      region: this.configService.getOrThrow<string>('DO_SPACES_REGION'),
    });
  }

  async saveFile(file: Express.MulterS3.File, ownerId: number, type: string = 'product'): Promise<MediaEntity> {
    const key = file.key || `${uuidv4()}-${file.originalname}`;
    const src = file.location || `https://suuq-media.ams3.cdn.digitaloceanspaces.com/${key}`;

    const media = this.mediaRepo.create({
      key,
      src,
      mimeType: file.mimetype,
      fileName: file.originalname,
      ownerId,
      type,
    });

    return this.mediaRepo.save(media);
  }

  async create(dto: CreateMediaDto): Promise<MediaEntity> {
    const media = this.mediaRepo.create(dto);
    return this.mediaRepo.save(media);
  }

  async bulkCreate(dto: BulkMediaDto): Promise<MediaEntity[]> {
    const entities = dto.media.map((m) => this.mediaRepo.create(m));
    return this.mediaRepo.save(entities);
  }

  async update(id: number, dto: Partial<MediaEntity>, userId: number): Promise<MediaEntity> {
    const media = await this.mediaRepo.findOne({ where: { id } });
    if (!media) throw new NotFoundException('Media not found');
    if (media.ownerId !== userId)
      throw new ForbiddenException('You are not the owner of this media');

    Object.assign(media, dto);
    return this.mediaRepo.save(media);
  }

  private async deleteFromSpaces(key: string): Promise<void> {
    const deleteCommand = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    await this.s3Client.send(deleteCommand);
  }

  async deleteByKey(key: string, userId: number): Promise<boolean> {
    const media = await this.mediaRepo.findOne({ where: { key, ownerId: userId } });
    if (!media) throw new NotFoundException('Media not found or not owned by user');
    await this.deleteFromSpaces(media.key);
    await this.mediaRepo.remove(media);
    return true;
  }

  async findByOwner(ownerId: number): Promise<MediaEntity[]> {
    return this.mediaRepo.find({ where: { ownerId } });
  }

  async findPaginatedByOwner(
    ownerId: number,
    page: number,
    limit: number,
    sortBy: string,
    order: 'ASC' | 'DESC',
    type?: string,
  ): Promise<{ data: MediaEntity[]; total: number; page: number }> {
    const where: any = { ownerId };
    if (type) where.type = type;

    const [data, total] = await this.mediaRepo.findAndCount({
      where,
      order: { [sortBy]: order },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total, page };
  }

  async findOneById(id: number, userId?: number): Promise<MediaEntity | null> {
    const where = userId ? { id, ownerId: userId } : { id };
    return this.mediaRepo.findOne({ where });
  }

  async findManyByIds(ids: number[], userId?: number): Promise<MediaEntity[]> {
    const where = userId ? { id: In(ids), ownerId: userId } : { id: In(ids) };
    return this.mediaRepo.find({ where });
  }
}
