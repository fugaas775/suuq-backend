import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { Tag } from './tag.entity';

@Injectable()
export class TagService {
  constructor(
    @InjectRepository(Tag)
    private readonly tagRepository: Repository<Tag>,
  ) {}

  async suggestTags(q?: string): Promise<string[]> {
    const where = q
      ? { name: ILike(`%${q}%`) }
      : {};
    const tags = await this.tagRepository.find({
      where,
      take: 20,
      order: { name: 'ASC' },
    });
    return tags.map(tag => tag.name);
  }

  async findAll(): Promise<Tag[]> {
    return this.tagRepository.find({ order: { name: 'ASC' } });
  }

  async create(name: string): Promise<Tag> {
    // Optional: Prevent duplicate tag names
    const existing = await this.tagRepository.findOneBy({ name });
    if (existing) {
      throw new ConflictException('Tag name already exists');
    }
    const tag = this.tagRepository.create({ name });
    return this.tagRepository.save(tag);
  }

  async delete(id: number): Promise<{ deleted: boolean }> {
    const result = await this.tagRepository.delete(id);
    return { deleted: (result.affected ?? 0) > 0 };
  }

  async findById(id: number): Promise<Tag> {
    const tag = await this.tagRepository.findOneBy({ id });
    if (!tag) throw new NotFoundException('Tag not found');
    return tag;
  }
}