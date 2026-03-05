import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('feed_interactions')
export class FeedInteraction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 255, nullable: true })
  requestId: string;

  @Index()
  @Column({ type: 'varchar', length: 255 })
  productId: string;

  @Index()
  @Column({ type: 'varchar', length: 50 })
  action: string; // e.g., 'click', 'add_to_cart', 'impression'

  @Column({ type: 'varchar', length: 255, nullable: true })
  userId: string; // Optional, if the user is logged in

  @CreateDateColumn()
  createdAt: Date;
}
