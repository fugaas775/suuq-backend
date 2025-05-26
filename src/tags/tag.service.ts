// src/tags/tag.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tag } from './tag.entity';

@Injectable()
export class TagService {
  constructor(
    @InjectRepository(Tag)
    private readonly tagRepo: Repository<Tag>,
  ) {}

  async create(name: string): Promise<Tag> {
    const exists = await this.tagRepo.findOne({ where: { name } });
    if (exists) return exists;
    const tag = this.tagRepo.create({ name });
    return this.tagRepo.save(tag);
  }

  findAll(): Promise<Tag[]> {
    return this.tagRepo.find({ order: { name: 'ASC' } });
  }

  async delete(id: number): Promise<{ deleted: boolean }> {
    const result = await this.tagRepo.delete(id);
    return { deleted: (result.affected ?? 0) > 0 };
  }

  async findById(id: number): Promise<Tag> {
    const tag = await this.tagRepo.findOneBy({ id });
    if (!tag) throw new NotFoundException('Tag not found');
    return tag;
  }
}
