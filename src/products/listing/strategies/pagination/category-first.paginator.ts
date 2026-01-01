import { Injectable } from '@nestjs/common';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Product } from '../../../entities/product.entity';
import { Category } from '../../../../categories/entities/category.entity';

@Injectable()
export class CategoryFirstPaginator {
  constructor(
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(Category)
    private readonly categoryRepo: Repository<Category>,
  ) {}

  async execute(
    base: SelectQueryBuilder<Product>,
    categoryIds: number[],
    page: number,
    perPage: number,
    geoAppend = false,
    opts?: { strict?: boolean },
  ): Promise<{
    items: Product[];
    total: number;
    meta?: { usedOthers: boolean; geoFilled: number };
  }> {
    const start = (page - 1) * perPage;

    const primaryQb = base
      .clone()
      .andWhere('category.id IN (:...catIds)', { catIds: categoryIds });
    const othersQb = base
      .clone()
      .andWhere('category.id NOT IN (:...catIds)', { catIds: categoryIds });

    const primaryTotal = await primaryQb.getCount();
    const othersTotal = opts?.strict ? 0 : await othersQb.getCount();

    let items: Product[] = [];
    let usedOthers = false;
    let geoFilled = 0;
    if (start < primaryTotal) {
      const primaryItems = await primaryQb.skip(start).take(perPage).getMany();
      if (!opts?.strict && primaryItems.length < perPage) {
        const remain = perPage - primaryItems.length;
        const otherItems = await othersQb.skip(0).take(remain).getMany();
        items = primaryItems.concat(otherItems);
        usedOthers = otherItems.length > 0;
      } else {
        items = primaryItems;
      }
    } else {
      if (!opts?.strict) {
        const othersStart = start - primaryTotal;
        items = await othersQb.skip(othersStart).take(perPage).getMany();
        usedOthers = items.length > 0;
      } else {
        items = [];
      }
    }

    // Optional geoAppend: top-up from globally ordered base when underfilled
    if (geoAppend && !opts?.strict && items.length < perPage) {
      const need = perPage - items.length;
      const exclude = new Set(items.map((i) => i.id));
      const filler = base
        .clone()
        .andWhere('product.id NOT IN (:...exclude)', {
          exclude: exclude.size ? Array.from(exclude) : [0],
        })
        .take(need);
      const fillItems = await filler.getMany();
      for (const it of fillItems) {
        if (items.length >= perPage) break;
        if (!exclude.has((it as any).id)) items.push(it);
        geoFilled++;
      }
    }

    return {
      items,
      total: primaryTotal + othersTotal,
      meta: { usedOthers, geoFilled },
    };
  }
}
