import { Injectable } from '@nestjs/common';
import { ProductListingDto } from './dto/product-listing.dto';
import { ProductQueryBuilder } from './builders/product-query.builder';
import { InjectRepository } from '@nestjs/typeorm';
import { Product } from '../entities/product.entity';
import { Repository } from 'typeorm';
import { Category } from '../../categories/entities/category.entity';
import { CategoryFilter } from './strategies/filtering/category.filter';
import { PriceFilter } from './strategies/filtering/price.filter';
import { TagsFilter } from './strategies/filtering/tags.filter';
import { SearchFilter } from './strategies/filtering/search.filter';
import { VendorFilter } from './strategies/filtering/vendor.filter';
import { PropertyFilter } from './strategies/filtering/property.filter';
import { CreatedSort } from './strategies/sorting/created.sort';
import { RatingSort } from './strategies/sorting/rating.sort';
import { SalesSort } from './strategies/sorting/sales.sort';
import { PriceSort } from './strategies/sorting/price.sort';
import { ViewsSort } from './strategies/sorting/views.sort';
import { CategoryFirstPaginator } from './strategies/pagination/category-first.paginator';
import { GeoPriorityAugment } from './strategies/filtering/geo-priority.filter';
import { DistanceFilter } from './strategies/filtering/distance.filter';
import { BestMatchSort } from './strategies/sorting/best-match.sort';
import { DistanceSort } from './strategies/sorting/distance.sort';
import { toProductCard } from '../utils/product-card.util';
import { CurrencyService } from '../../common/services/currency.service';

@Injectable()
export class ProductListingService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
    private readonly currencyService: CurrencyService,
  ) {}

  private readonly supportedCurrencies = ['ETB', 'SOS', 'KES', 'DJF', 'USD'];

  private normalizeCurrency(value?: string): string {
    const upper = (value || '').trim().toUpperCase();
    return this.supportedCurrencies.includes(upper) ? upper : 'ETB';
  }

  private convertItemsCurrency(items: any[], target: string): any[] {
    if (!Array.isArray(items) || !items.length) return items || [];
    return items.map((it) => {
      const from = it?.currency || 'ETB';
      try {
        if (typeof it.price === 'number') {
          it.price = this.currencyService.convert(it.price, from, target);
        }
        if (typeof it.sale_price === 'number') {
          it.sale_price = this.currencyService.convert(
            it.sale_price,
            from,
            target,
          );
        }
        it.currency = target;
      } catch {
        it.currency = from;
      }
      return it;
    });
  }

  async list(dto: ProductListingDto, opts?: { mapCards?: boolean }) {
    const queryBuilder = new ProductQueryBuilder(
      this.productRepository.createQueryBuilder('product'),
    );
    // Grid view default
    if ((dto.view || 'grid') === 'grid') queryBuilder.applyGridView();

    // 1. Apply Filters (order is intentional to reduce result set early)
    const filters = [
      new SearchFilter(),
      new VendorFilter(),
      new TagsFilter(),
      new PriceFilter(),
      new PropertyFilter(),
      new CategoryFilter(this.categoryRepository as any),
      // Augmenters (do not sort): geo priority rank and optional distance computation/radius filter
      new GeoPriorityAugment(this.categoryRepository as any),
      new DistanceFilter(),
    ];
    for (const f of filters) {
      const out = f.apply(queryBuilder.query, dto);
      if (out instanceof Promise) await out;
    }

    // 2. Apply Sorting
    const sortKey = (dto.sort || 'created_desc').toLowerCase();
    const sortMap: Record<string, any> = {
      best_match: new BestMatchSort(),
      distance_asc: new DistanceSort('ASC'),
      distance_desc: new DistanceSort('DESC'),
      created_desc: new CreatedSort(),
      rating_desc: new RatingSort(),
      sales_desc: new SalesSort(),
      price_asc: new PriceSort(),
      price_desc: new PriceSort(),
      views_desc: new ViewsSort(),
    };
    const sorter = sortMap[sortKey] || new CreatedSort();
    sorter.apply(queryBuilder.query, dto);

    // 3. Pagination happens inside execute

    // 4. Pagination/Execute (category-first union if requested)
    let items: Product[] = [];
    let total = 0;
    let debugMeta: any = undefined;
    if (dto.categoryFirst && (dto.categoryId?.length || dto.categorySlug)) {
      const paginator = new CategoryFirstPaginator(
        this.productRepository,
        this.categoryRepository as any,
      );
      const strict =
        (dto.strictCategory ?? dto.includeDescendants === false) ? true : false;

      // Resolve effective category IDs for pagination: include slug and optionally descendants
      const baseIds: number[] = [];
      if (Array.isArray(dto.categoryId)) baseIds.push(...dto.categoryId);
      if (dto.categorySlug) {
        const cat = await this.categoryRepository.findOne({
          where: { slug: dto.categorySlug },
        });
        if (cat) baseIds.push(cat.id);
      }
      const idSet = new Set<number>();
      for (const id of baseIds) {
        if (dto.includeDescendants) {
          const root = await this.categoryRepository.findOne({ where: { id } });
          if (root) {
            const desc = await (this.categoryRepository as any).findDescendants(
              root,
            );
            for (const d of desc) idSet.add(d.id);
          }
        } else {
          idSet.add(id);
        }
      }
      const effectiveCatIds = Array.from(idSet);

      const res = await paginator.execute(
        queryBuilder.query,
        effectiveCatIds,
        dto.page,
        dto.perPage,
        !!dto.geoAppend,
        { strict },
      );
      items = res.items;
      total = res.total;
      debugMeta = res.meta;

      // Strict-empty → optional parent fallback
      if (strict && items.length === 0 && dto.strictEmptyFallbackParentId) {
        const parent = await this.categoryRepository.findOne({
          where: { id: dto.strictEmptyFallbackParentId },
        });
        if (parent) {
          const parentIds: number[] = [];
          if (dto.fallbackDescendants !== false) {
            const desc = await (this.categoryRepository as any).findDescendants(
              parent,
            );
            for (const d of desc) parentIds.push(d.id);
          } else {
            parentIds.push(parent.id);
          }
          const res2 = await paginator.execute(
            queryBuilder.query,
            parentIds,
            dto.page,
            dto.perPage,
            true, // allow geoAppend on fallback
            { strict: false },
          );
          items = res2.items;
          total = res2.total;
          debugMeta = {
            ...(res?.meta || {}),
            fallbackToParent: parent.id,
            fallbackMeta: res2.meta,
          };
        }
      }
    } else {
      const res = await queryBuilder.execute(dto.page, dto.perPage);
      items = res.items;
      total = res.total;
    }

    const targetCurrency = this.normalizeCurrency((dto as any).currency);
    const mappedItems =
      opts?.mapCards && (dto.view || 'grid') === 'grid'
        ? (items as any[]).map((p) => toProductCard(p))
        : items;
    const payload = {
      items: this.convertItemsCurrency(mappedItems as any[], targetCurrency),
      total,
      page: dto.page,
      perPage: dto.perPage,
      totalPages: Math.ceil(total / dto.perPage),
      ...(dto.debugListing ? { debug: { meta: debugMeta } } : {}),
    };
    return payload;
  }
}
