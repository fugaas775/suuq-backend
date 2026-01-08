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

  // e.g. "am" for Ethiopia, "so" for Somalia
  @Column({ nullable: true, length: 5 })
  defaultLanguage?: string;

  @Column('text')
  description!: string;

  // e.g. { "am": "ኢትዮጵያ", "so": "Itoobiya" }
  @Column({ name: 'name_translations', type: 'jsonb', nullable: true })
  nameTranslations?: Record<string, string> | null;

  @Column({ name: 'description_translations', type: 'jsonb', nullable: true })
  descriptionTranslations?: Record<string, string> | null;

  // Use jsonb for flexible array of objects in PostgreSQL
  @Column({ type: 'jsonb', default: [] })
  supplies!: Supply[];
}
