import { Injectable } from '@nestjs/common';

@Injectable()
export class CategoriesService {
  private categories = [
    { id: 1, name: 'Clothing' },
    { id: 2, name: 'Electronics' },
    { id: 3, name: 'Home & Kitchen' },
  ];

  getAll() {
    return this.categories;
  }
}
