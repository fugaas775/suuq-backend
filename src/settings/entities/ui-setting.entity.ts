import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('ui_setting')
export class UiSetting {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ unique: true })
  key!: string;

  @Column('jsonb')
  value!: any;

  @Column({ nullable: true })
  description?: string;
}
