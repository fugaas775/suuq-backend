import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('system_setting')
export class SystemSetting {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ unique: true })
  key!: string;

  @Column('jsonb')
  value!: any;

  @Column({ nullable: true })
  description?: string;
}
