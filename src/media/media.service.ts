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
import { S3 } from 'aws-sdk';
import { ConfigService } from '@nestjs/config';
import { deleteFromSpaces } from './createMulterStorage';

const config = new ConfigService();
const s3 = new S3({
  credentials: {
    accessKeyId: config.getOrThrow<string>('DO_SPACES_KEY'),
    secretAccessKey: config.getOrThrow<string>('DO_SPACES_SECRET'), // ✅ FIXED
  },
  endpoint: config.getOrThrow<string>('DO_SPACES_ENDPOINT'),
  region: config.getOrThrow<string>('DO_SPACES_REGION'),
  signatureVersion: 'v4',
});
const BUCKET = config.getOrThrow<string>('DO_SPACES_BUCKET');

@Injectable()
export class MediaService {
  constructor(
    @InjectRepository(MediaEntity)
    private readonly mediaRepo: Repository<MediaEntity>,
  ) {}

  async saveFile(file: Express.Multer.File, ownerId: number, type: string = 'product'): Promise<MediaEntity> {
    const key = (file as any)?.key || `${uuidv4()}-${file.originalname}`;
    const src = (file as any)?.location || `https://suuq-media.ams3.cdn.digitaloceanspaces.com/${key}`;

    const media = this.mediaRepo.create({
      key,
      src,
      mimeType: file.mimetype,
      fileName: file.originalname,
      ownerId,
      type,
    });

    const saved = await this.mediaRepo.save(media);

    if (file.mimetype.startsWith('image/') && (file as any)?.buffer) {
      const thumbBuffer = await sharp((file as any).buffer)
        .resize(300)
        .webp()
        .toBuffer();

      const thumbKey = key.replace(/(\.[^.]+)$/, '.thumb.webp');

      await s3
        .putObject({
          Bucket: BUCKET,
          Key: thumbKey,
          Body: thumbBuffer,
          ContentType: 'image/webp',
          ACL: 'public-read',
        })
        .promise();

      console.log(`[S3] Thumbnail uploaded: ${thumbKey}`);
    }

    return saved;
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

  async deleteByKey(key: string, userId: number): Promise<boolean> {
    const media = await this.mediaRepo.findOne({ where: { key, ownerId: userId } });
    if (!media) throw new NotFoundException('Media not found or not owned by user');

    await deleteFromSpaces(media.key);
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
