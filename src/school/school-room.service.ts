import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SchoolRoom } from './entities/school-room.entity';
import { SchoolClass } from './entities/school-class.entity';
import {
  CreateSchoolRoomDto,
  UpdateSchoolRoomDto,
} from './dto/school-room.dto';

const text = (v: unknown) => String(v ?? '').trim();
const fold = (v: unknown) => text(v).toLowerCase();
const int = (v: unknown, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : fallback;
};

/** What a room seats: (desks − broken) × seats per desk, or the mat's count. */
export function roomCapacity(
  room: Pick<
    SchoolRoom,
    'seating' | 'desks' | 'brokenDesks' | 'seatsPerDesk' | 'matCapacity'
  >,
): number | null {
  if (String(room.seating).toUpperCase() === 'MAT') {
    return room.matCapacity == null
      ? null
      : Math.max(0, Number(room.matCapacity));
  }
  const usable = Math.max(
    0,
    Number(room.desks || 0) - Number(room.brokenDesks || 0),
  );
  return usable * Math.max(1, Number(room.seatsPerDesk || 3));
}

@Injectable()
export class SchoolRoomService {
  constructor(
    @InjectRepository(SchoolRoom)
    private readonly rooms: Repository<SchoolRoom>,
    @InjectRepository(SchoolClass)
    private readonly classes: Repository<SchoolClass>,
  ) {}

  private toResponse(row: SchoolRoom) {
    return {
      id: Number(row.id),
      branchId: row.branchId,
      name: row.name,
      seating: row.seating,
      desks: row.desks,
      brokenDesks: row.brokenDesks,
      seatsPerDesk: row.seatsPerDesk,
      matCapacity: row.matCapacity ?? null,
      capacity: roomCapacity(row),
      note: row.note ?? null,
      sortOrder: row.sortOrder ?? 0,
    };
  }

  async list(branchId: number) {
    const rows = await this.rooms.find({
      where: { branchId },
      order: { sortOrder: 'ASC', id: 'ASC' },
    });
    return { items: rows.map((r) => this.toResponse(r)) };
  }

  private apply(row: SchoolRoom, dto: Partial<CreateSchoolRoomDto>) {
    if (dto.name !== undefined) row.name = text(dto.name).slice(0, 80);
    if (dto.seating !== undefined)
      row.seating =
        String(dto.seating).toUpperCase() === 'MAT' ? 'MAT' : 'DESK';
    if (dto.desks !== undefined) row.desks = int(dto.desks, 0);
    if (dto.brokenDesks !== undefined)
      row.brokenDesks = int(dto.brokenDesks, 0);
    if (dto.seatsPerDesk !== undefined)
      row.seatsPerDesk = Math.max(1, int(dto.seatsPerDesk, 3));
    if (dto.matCapacity !== undefined)
      row.matCapacity =
        dto.matCapacity === null ? null : int(dto.matCapacity, 0);
    if (dto.note !== undefined) row.note = text(dto.note).slice(0, 300) || null;
    if (dto.sortOrder !== undefined) row.sortOrder = Number(dto.sortOrder) || 0;
    if (row.brokenDesks > row.desks) {
      throw new BadRequestException(
        `${row.brokenDesks} broken desks in a room of ${row.desks}.`,
      );
    }
  }

  async create(dto: CreateSchoolRoomDto) {
    const name = text(dto.name);
    if (!name) throw new BadRequestException('A room needs a name.');
    const clash = (
      await this.rooms.find({ where: { branchId: dto.branchId } })
    ).find((r) => fold(r.name) === fold(name));
    if (clash)
      throw new BadRequestException(
        `A room called "${clash.name}" is already listed.`,
      );
    const count = await this.rooms.count({ where: { branchId: dto.branchId } });
    const row = this.rooms.create({
      branchId: dto.branchId,
      name,
      seating: 'DESK',
      desks: 0,
      brokenDesks: 0,
      seatsPerDesk: 3,
      matCapacity: null,
      note: null,
      sortOrder: count,
    });
    this.apply(row, dto);
    return this.toResponse(await this.rooms.save(row));
  }

  async update(id: number, dto: UpdateSchoolRoomDto) {
    const row = await this.rooms.findOne({
      where: { id, branchId: dto.branchId },
    });
    if (!row) throw new NotFoundException(`Room ${id} not found.`);
    if (dto.name !== undefined && fold(dto.name) !== fold(row.name)) {
      const clash = (
        await this.rooms.find({ where: { branchId: dto.branchId } })
      ).find(
        (r) => Number(r.id) !== Number(id) && fold(r.name) === fold(dto.name),
      );
      if (clash)
        throw new BadRequestException(
          `A room called "${clash.name}" is already listed.`,
        );
    }
    this.apply(row, dto);
    return this.toResponse(await this.rooms.save(row));
  }

  /** A room comes off the list only when no class sits in it. */
  async remove(id: number, branchId: number) {
    const row = await this.rooms.findOne({ where: { id, branchId } });
    if (!row) throw new NotFoundException(`Room ${id} not found.`);
    const using = await this.classes.count({ where: { branchId, roomId: id } });
    if (using)
      throw new BadRequestException(
        `${using} class${using === 1 ? '' : 'es'} still sit in "${row.name}" — move them first.`,
      );
    await this.rooms.remove(row);
    return { removed: true, id };
  }

  /** For the class service: does this room exist on the branch? */
  async assertOnBranch(branchId: number, roomId: number) {
    const row = await this.rooms.findOne({ where: { id: roomId, branchId } });
    if (!row)
      throw new BadRequestException(
        `Room ${roomId} is not one of this school's rooms.`,
      );
    return row;
  }
}
