import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SchoolClass } from './entities/school-class.entity';
import {
  SchoolExamSitting,
  SchoolExamTimetable,
} from './entities/school-exam-timetable.entity';
import { SaveSchoolExamTimetableDto } from './dto/school-exam-timetable.dto';

const fold = (v: unknown) =>
  String(v ?? '')
    .trim()
    .toLowerCase();
const minutes = (hhmm: string) => {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + m;
};

/**
 * Exam timetables — one document per exam per branch (see the entity).
 *
 * Every rule is checked in memory before the write, so a refused save leaves
 * the stored exam exactly as it was: class codes are put in the registry's
 * spelling and an unknown one refused; an exam must end after it starts; and
 * a class cannot sit two exams at once — the clash the office is most likely
 * to make by hand when it moves one subject to another day.
 */
@Injectable()
export class SchoolExamTimetableService {
  constructor(
    @InjectRepository(SchoolExamTimetable)
    private readonly exams: Repository<SchoolExamTimetable>,
    @InjectRepository(SchoolClass)
    private readonly classes: Repository<SchoolClass>,
  ) {}

  async list(branchId: number) {
    const rows = await this.exams.find({
      where: { branchId },
      order: { startsOn: 'DESC', id: 'DESC' },
    });
    return { items: rows.map((r) => this.toResponse(r)) };
  }

  /** What a family is shown: PUBLISHED exams, this class's sittings only. */
  async publishedFor(branchId: number, classCode: string | null | undefined) {
    const want = fold(classCode);
    if (!want) return [];
    const rows = await this.exams.find({
      where: { branchId, status: 'PUBLISHED' },
      order: { startsOn: 'DESC', id: 'DESC' },
    });
    return rows
      .map((r) => ({
        id: Number(r.id),
        title: r.title,
        startsOn: r.startsOn,
        notes: r.notes ?? null,
        sittings: (r.sittings || []).filter((s) => fold(s.classCode) === want),
      }))
      .filter((r) => r.sittings.length > 0);
  }

  async create(dto: SaveSchoolExamTimetableDto, userId: number | null) {
    const planned = await this.plan(dto);
    await this.assertTitleFree(dto.branchId, planned.title, null);
    const row = this.exams.create({
      branchId: dto.branchId,
      ...planned,
      updatedByUserId: userId,
    });
    return this.toResponse(await this.exams.save(row));
  }

  async update(
    id: number,
    dto: SaveSchoolExamTimetableDto,
    userId: number | null,
  ) {
    const row = await this.exams.findOne({
      where: { id, branchId: dto.branchId },
    });
    if (!row) throw new NotFoundException('No such exam timetable.');
    const planned = await this.plan(dto);
    await this.assertTitleFree(dto.branchId, planned.title, Number(row.id));
    Object.assign(row, planned, { updatedByUserId: userId });
    return this.toResponse(await this.exams.save(row));
  }

  async remove(id: number, branchId: number) {
    const row = await this.exams.findOne({ where: { id, branchId } });
    if (!row) throw new NotFoundException('No such exam timetable.');
    await this.exams.delete({ id: row.id });
    return { removed: Number(row.id) };
  }

  private async assertTitleFree(
    branchId: number,
    title: string,
    exceptId: number | null,
  ) {
    const same = await this.exams
      .createQueryBuilder('e')
      .where('e."branchId" = :branchId', { branchId })
      .andWhere('lower(e.title) = :t', { t: fold(title) })
      .getOne();
    if (same && Number(same.id) !== exceptId) {
      throw new ConflictException(
        `This school already has an exam timetable called "${same.title}".`,
      );
    }
  }

  /** Canonicalise and check every sitting; refuse the whole save on any fault. */
  private async plan(dto: SaveSchoolExamTimetableDto) {
    const title = String(dto.title || '').trim();
    if (!title)
      throw new BadRequestException('An exam timetable needs a name.');
    const registry = await this.classes.find({
      where: { branchId: dto.branchId },
    });
    const byLower = new Map(registry.map((c) => [fold(c.code), c.code]));
    const sittings: SchoolExamSitting[] = [];
    for (const raw of dto.sittings || []) {
      const classCode = byLower.get(fold(raw.classCode));
      if (!classCode) {
        throw new BadRequestException(
          `"${raw.classCode}" is not a class of this school.`,
        );
      }
      const subject = String(raw.subject || '').trim();
      if (!subject) {
        throw new BadRequestException(
          `An exam for ${classCode} has no subject.`,
        );
      }
      if (minutes(raw.end) <= minutes(raw.start)) {
        throw new BadRequestException(
          `${classCode} ${subject} on ${raw.date} ends before it starts.`,
        );
      }
      sittings.push({
        date: raw.date,
        start: raw.start,
        end: raw.end,
        classCode,
        subject,
        invigilator: String(raw.invigilator || '').trim() || null,
      });
    }
    sittings.sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.start.localeCompare(b.start) ||
        a.classCode.localeCompare(b.classCode, undefined, { numeric: true }),
    );
    // A class sitting two exams at once.
    const lastEnd = new Map<string, { end: number; subject: string }>();
    for (const s of sittings) {
      const key = `${s.date}|${fold(s.classCode)}`;
      const prev = lastEnd.get(key);
      if (prev && minutes(s.start) < prev.end) {
        throw new BadRequestException(
          `${s.classCode} would sit ${prev.subject} and ${s.subject} at the same time on ${s.date}.`,
        );
      }
      lastEnd.set(key, { end: minutes(s.end), subject: s.subject });
    }
    return {
      title,
      startsOn: dto.startsOn,
      status:
        dto.status === 'PUBLISHED'
          ? ('PUBLISHED' as const)
          : ('DRAFT' as const),
      sittings,
      notes: String(dto.notes || '').trim() || null,
    };
  }

  private toResponse(r: SchoolExamTimetable) {
    return {
      id: Number(r.id),
      branchId: r.branchId,
      title: r.title,
      startsOn: r.startsOn,
      status: r.status,
      sittings: r.sittings || [],
      notes: r.notes ?? null,
      updatedAt: r.updatedAt,
      createdAt: r.createdAt,
    };
  }
}
