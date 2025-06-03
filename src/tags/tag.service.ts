import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tag } from './tag.entity';

@Injectable()
export class TagService {
  constructor(
    @InjectRepository(Tag)
    private readonly tagRepository: Repository<Tag>,
  ) {}

  async suggestTags(): Promise<string[]> {
    const tags = await this.tagRepository.find({ take: 20, order: { name: 'ASC' } });
    return tags.map(tag => tag.name);
  }

  async findAll(): Promise<Tag[]> {
    return this.tagRepository.find({ order: { name: 'ASC' } });
  }

  async create(name: string): Promise<Tag> {
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
