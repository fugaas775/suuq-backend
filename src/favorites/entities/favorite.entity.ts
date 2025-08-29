import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('favorites')
export class Favorite {
  // One row per user
  @PrimaryColumn('int')
  userId!: number;

  // Ordered list of product IDs
  @Column('int', { array: true, default: '{}' })
  ids!: number[];

  // Incremented only when content changes
  @Column('int', { default: 0 })
  version!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
