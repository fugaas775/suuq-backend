import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ScopeActor } from '../school/school-class-scope.service';
import {
  CreateSchoolCurriculumResourceDto,
  UpdateSchoolCurriculumResourceDto,
} from './dto/school-curriculum.dto';
import {
  CurriculumResourceKind,
  SchoolCurriculumResource,
} from './entities/school-curriculum-resource.entity';
import { SchoolStaffReachService } from './school-staff-reach.service';

const text = (v: unknown) => String(v ?? '').trim();

/**
 * The grade a class code names: its leading number, after an optional word
 * for "grade" in the languages the schools write it in — "7th", "8aad",
 * "3aad B", "Grade 7", "G7", "Fasalka 9", "10th". A nursery or KG code has
 * no number and belongs to no grade's shelf.
 */
export function gradeNumberOf(code: unknown): number | null {
  const s = text(code);
  if (!s) return null;
  const m = s.match(
    /^(?:grade|gr|g|class|fasalka|fasal|kutaa|kifil|std|standard|form)?\s*[-.]?\s*(\d{1,2})(?!\d)/i,
  );
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= 14 ? n : null;
}

/** The distinct grades a set of class codes spans, ascending. */
export function gradesOfClasses(codes: Iterable<unknown>): number[] {
  const out = new Set<number>();
  for (const code of codes) {
    const n = gradeNumberOf(code);
    if (n != null) out.add(n);
  }
  return [...out].sort((a, b) => a - b);
}

export type CurriculumResourceView = {
  id: number;
  kind: CurriculumResourceKind;
  subject: string;
  series: string | null;
  title: string;
  grades: number[];
  studentUrl: string;
  teacherUrl?: string | null;
  questions: number | null;
  note: string | null;
  sortOrder: number;
  isActive?: boolean;
  updatedAt?: Date;
};

const byShelf = (a: SchoolCurriculumResource, b: SchoolCurriculumResource) =>
  a.subject.localeCompare(b.subject) ||
  (a.series ?? '').localeCompare(b.series ?? '') ||
  Number(a.sortOrder) - Number(b.sortOrder) ||
  Number(a.id) - Number(b.id);

/**
 * The curriculum shelf every school on the SCHOOL format reads — textbook
 * PDFs, slides and item banks the platform's admins list once.
 *
 * Three readers, three cuts of one list: a pupil (and their family) gets
 * the live items for THEIR grade without the teachers' links; a member of
 * staff gets the whole live list with the teachers' links and the grades
 * their own classes span, so their page can lead with those; an admin gets
 * everything, taken-down items included.
 */
@Injectable()
export class SchoolCurriculumService {
  constructor(
    @InjectRepository(SchoolCurriculumResource)
    private readonly repo: Repository<SchoolCurriculumResource>,
    @Optional() private readonly reachSvc?: SchoolStaffReachService,
  ) {}

  view(
    row: SchoolCurriculumResource,
    opts: { teacher?: boolean; admin?: boolean } = {},
  ): CurriculumResourceView {
    const out: CurriculumResourceView = {
      id: Number(row.id),
      kind: row.kind,
      subject: row.subject,
      series: row.series ?? null,
      title: row.title,
      grades: [...(row.grades ?? [])].map(Number).sort((a, b) => a - b),
      studentUrl: row.studentUrl,
      questions: row.questions ?? null,
      note: row.note ?? null,
      sortOrder: Number(row.sortOrder) || 0,
    };
    if (opts.teacher || opts.admin) out.teacherUrl = row.teacherUrl ?? null;
    if (opts.admin) {
      out.isActive = row.isActive !== false;
      out.updatedAt = row.updatedAt;
    }
    return out;
  }

  /** Every live item, shelf order. The list is platform-wide and small; it is cut in memory. */
  async listActive(): Promise<SchoolCurriculumResource[]> {
    const rows = await this.repo.find({ where: { isActive: true } });
    return rows.sort(byShelf);
  }

  /** The pupil's (and the family's) cut: their grade, no teachers' links. */
  async forGrade(grade: number | null): Promise<CurriculumResourceView[]> {
    if (grade == null) return [];
    const rows = await this.listActive();
    return rows
      .filter((r) => (r.grades ?? []).some((g) => Number(g) === grade))
      .map((r) => this.view(r));
  }

  /**
   * A member of staff's cut: the whole live shelf with the teachers' links,
   * and the grades the classes they reach span (null for the heads, who
   * reach every class) so the page can lead with their own.
   */
  async forStaff(branchId: number, actor: ScopeActor) {
    const [rows, reach] = await Promise.all([
      this.listActive(),
      this.reachSvc
        ? this.reachSvc.resolve(branchId, actor)
        : Promise.resolve(null),
    ]);
    const grades =
      !reach || reach.head || !reach.classes
        ? null
        : gradesOfClasses(reach.classes);
    return {
      items: rows.map((r) => this.view(r, { teacher: true })),
      grades,
    };
  }

  // ── the platform's admins ────────────────────────────────────────────────

  async adminList() {
    const rows = await this.repo.find();
    return { items: rows.sort(byShelf).map((r) => this.view(r, { admin: true })) };
  }

  private async assertUrlFree(studentUrl: string, exceptId: number | null) {
    const clash = await this.repo.findOne({ where: { studentUrl } });
    if (clash && Number(clash.id) !== Number(exceptId)) {
      throw new BadRequestException({
        error: {
          code: 'SCHOOL_CURRICULUM_URL_LISTED',
          message: `That student link is already listed as "${clash.title}".`,
        },
      });
    }
  }

  async create(
    dto: CreateSchoolCurriculumResourceDto,
    actor: { id?: number | null; name?: string | null } = {},
  ) {
    const studentUrl = text(dto.studentUrl);
    await this.assertUrlFree(studentUrl, null);
    const row = this.repo.create({
      kind: dto.kind as CurriculumResourceKind,
      subject: text(dto.subject),
      series: text(dto.series) || null,
      title: text(dto.title),
      grades: [...new Set(dto.grades.map(Number))].sort((a, b) => a - b),
      studentUrl,
      teacherUrl: text(dto.teacherUrl) || null,
      questions: dto.questions ?? null,
      note: text(dto.note) || null,
      sortOrder: Number(dto.sortOrder) || 0,
      isActive: true,
      createdByUserId: actor.id ?? null,
      createdByName: text(actor.name) || null,
    });
    const saved = await this.repo.save(row);
    return this.view(saved, { admin: true });
  }

  async update(id: number, dto: UpdateSchoolCurriculumResourceDto) {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('No such curriculum resource.');
    if (dto.kind !== undefined) row.kind = dto.kind as CurriculumResourceKind;
    if (dto.subject !== undefined) row.subject = text(dto.subject);
    if (dto.series !== undefined) row.series = text(dto.series) || null;
    if (dto.title !== undefined) row.title = text(dto.title);
    if (dto.grades !== undefined)
      row.grades = [...new Set(dto.grades.map(Number))].sort((a, b) => a - b);
    if (dto.studentUrl !== undefined) {
      const next = text(dto.studentUrl);
      await this.assertUrlFree(next, Number(row.id));
      row.studentUrl = next;
    }
    if (dto.teacherUrl !== undefined)
      row.teacherUrl = text(dto.teacherUrl) || null;
    if (dto.questions !== undefined) row.questions = dto.questions ?? null;
    if (dto.note !== undefined) row.note = text(dto.note) || null;
    if (dto.sortOrder !== undefined) row.sortOrder = Number(dto.sortOrder) || 0;
    if (dto.isActive !== undefined) row.isActive = Boolean(dto.isActive);
    const saved = await this.repo.save(row);
    return this.view(saved, { admin: true });
  }

  async remove(id: number) {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('No such curriculum resource.');
    await this.repo.remove(row);
    return { status: 'DELETED', id: Number(id) };
  }
}
