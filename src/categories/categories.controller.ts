import { Controller, Get } from '@nestjs/common';
import { CategoriesService } from './categories.service';

@Controller('suuq/v1/categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  async findAll() {
    return this.categoriesService.getAll(); // returns [{ id, name }]
  }
}
