import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { SchoolMessageSenderKind } from './school-message-thread.entity';

/**
 * One message on a thread. `senderName` is what the other side reads —
 * "Mustafe" for a teacher, the guardian's name for the family — and is
 * denormalised so the conversation still reads after a login is removed.
 * Messages are never edited or deleted: what was said to a family stands.
 */
@Entity('pos_school_messages')
@Index('idx_pos_school_messages_thread', ['threadId', 'id'])
export class SchoolMessage {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: number;

  @Column({ type: 'bigint' })
  threadId!: number;

  @Column({ type: 'int' })
  branchId!: number;

  @Column({ type: 'varchar', length: 16 })
  senderKind!: SchoolMessageSenderKind;

  @Column({ type: 'int', nullable: true })
  senderUserId!: number | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  senderName!: string | null;

  @Column({ type: 'text' })
  body!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
