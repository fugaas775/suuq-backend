import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, ManyToMany, JoinTable, CreateDateColumn } from 'typeorm';
import { User } from '../../users/user.entity';
import { Category } from '../../categories/category.entity';
import { Tag } from '../../tags/tag.entity';

@Entity()
export class Product {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  name!: string;

  @Column('decimal')
  price!: number;

  @Column()
  description!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @ManyToOne(() => User, (user: User) => user.products, { eager: false })
  vendor!: User;

  
  @ManyToOne(() => Category, category => category.products, { nullable: true })
  category?: Category;

  @ManyToMany(() => Tag, (tag) => tag.products, { cascade: true })
  @JoinTable()
  tags!: Tag[];

  @Column({ default: false })
  featured?: boolean = false;
 
}
