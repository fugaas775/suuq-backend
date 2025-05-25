import { Product } from '../products/entities/product.entity';
import { OneToMany } from 'typeorm';

@OneToMany(() => Product, (product) => product.vendor)
products!: Product[];
