import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

// This defines the shape of the { name: 'Coffee', icon: '...' } objects
interface Supply {
  name: string;
  icon: string;
  fact: string;
}

@Entity('country')
export class Country {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ unique: true })
  name!: string;

  @Column()
  flagUrl!: string;

  @Column()
  imageUrl!: string;

  @Column('text')
  description!: string;

  // Use jsonb for flexible array of objects in PostgreSQL
  @Column({ type: 'jsonb', default: [] })
  supplies!: Supply[];
}
