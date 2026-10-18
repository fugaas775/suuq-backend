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
import { gradeNumberOf } from './school-guardian.util';

const text = (v: unknown) => String(v ?? '').trim();

// Lives in school-guardian.util (the students' logins read it too); kept
// exported from here for every existing import.
export { gradeNumberOf };

/** The distinct grades a set of class codes spans, ascending. */
export function gradesOfClasses(codes: Iterable<unknown>): number[] {
  const out = new Set<number>();
  for (const code of codes) {
    const n = gradeNumberOf(code);
    if (n != null) out.add(n);
  }
  return [...out].sort((a, b) => a - b);
}

/**
 * One subject, many spellings. The shelf says "Mathematics"; a timetable
 * says "Maths", "Math" or "Xisaab"; a Grade 3 timetable in Godey says
 * "Af-Soomaali". The reader's cut must not fail on the spelling, so every
 * subject name folds to a key — lowercase, accents and punctuation gone —
 * and the common names of a subject fold to ONE key through this table.
 */
const SUBJECT_ALIASES: Record<string, string[]> = {
  mathematics: [
    'maths',
    'math',
    'mathematic',
    'xisaab',
    'xisaabta',
    'hisab',
    'hisaab',
    'herrega',
    'hesabu',
    'mathematiques',
    'ሒሳብ',
    'رياضيات',
    'الرياضيات',
  ],
  english: [
    'english language',
    'ingiriis',
    'ingiriisi',
    'ingiriisiga',
    'af ingiriisi',
    'af ingiriis',
    'kiingereza',
    'anglais',
    'afaan ingilizii',
    'እንግሊዝኛ',
    'إنجليزي',
    'انجليزي',
    'الإنجليزية',
  ],
  somali: [
    'af soomaali',
    'soomaali',
    'af somali',
    'kisomali',
    'somalien',
    'الصومالية',
    'ሶማልኛ',
  ],
  amharic: [
    'amaariga',
    'amharik',
    'amxaari',
    'amxaariga',
    'afaan amaaraa',
    'አማርኛ',
    'الأمهرية',
  ],
  arabic: [
    'carabi',
    'af carabi',
    'carabiga',
    'kiarabu',
    'arabe',
    'afaan arabaa',
    'ዓረብኛ',
    'عربي',
    'عربية',
    'العربية',
    'اللغة العربية',
  ],
  oromo: ['afaan oromoo', 'afan oromo', 'oromiffa', 'oromifa', 'ኦሮምኛ'],
  science: [
    'general science',
    'saynis',
    'sayniska',
    'saynis guud',
    'sayansi',
    'sciences',
    'ሳይንስ',
    'علوم',
    'العلوم',
  ],
  physics: [
    'fiisikis',
    'fisikis',
    'fizikia',
    'physique',
    'ፊዚክስ',
    'فيزياء',
    'الفيزياء',
  ],
  chemistry: [
    'kimistari',
    'kiimiko',
    'kemia',
    'chimie',
    'ኬሚስትሪ',
    'كيمياء',
    'الكيمياء',
  ],
  biology: [
    'bayooloji',
    'bayoloji',
    'baiolojia',
    'biologie',
    'ባዮሎጂ',
    'أحياء',
    'الأحياء',
  ],
  'social studies': [
    'social',
    'social study',
    'cilmiga bulshada',
    'bulsho',
    'maaddooyinka bulshada',
    'maarifa ya jamii',
    'ማህበራዊ ሳይንስ',
    'ማኅበራዊ ሳይንስ',
    'دراسات اجتماعية',
    'الدراسات الاجتماعية',
  ],
  // One subject under three generations of names: Civics, Civics and
  // Ethical Education, and the current curriculum's Citizenship Education.
  citizenship: [
    'citizenship education',
    'citizenship and ethics',
    'civics',
    'civic',
    'civic education',
    'civics and ethics',
    'civics and ethical education',
    'civic and ethical education',
    'civic and ethics',
    'ethics',
    'ethical education',
    'moral education',
    'moral and civic education',
    'waxbarashada dhaqanka',
    'muwaadinnimo',
    'muwaadin',
    'akhlaaq',
    'dhaqan iyo akhlaaq',
    'uraia',
    'elimu ya uraia',
    'barnoota lammummaa',
    'lammummaa',
    'ሥነ ዜጋ',
    'ስነ ዜጋ',
    'ሥነ ዜጋ እና ሥነ ምግባር',
    'ዜግነት',
    'ትምህርተ ዜግነት',
    'ስነ ዜጋን ስነ ምግባርን',
    'تربية مدنية',
    'التربية المدنية',
    'المواطنة',
    'التربية الوطنية',
  ],
  geography: [
    'juqraafi',
    'jiyoografi',
    'jiografia',
    'geographie',
    'ጂኦግራፊ',
    'جغرافيا',
    'الجغرافيا',
  ],
  history: [
    'taariikh',
    'taariikhda',
    'historia',
    'histoire',
    'ታሪክ',
    'تاريخ',
    'التاريخ',
  ],
  ict: [
    'computer',
    'computers',
    'computing',
    'information technology',
    'information and communication technology',
    'kombuyuutar',
    'teknolojia ya habari',
    'informatique',
    'ኮምፒውተር',
    'حاسوب',
    'الحاسوب',
  ],
  'islamic studies': [
    'islamic',
    'islamic education',
    'diin',
    'diinta',
    'tarbiya',
    'tarbiyah',
    'quran',
    'quraan',
    'التربية الإسلامية',
    'تربية إسلامية',
    'دين',
  ],
  'physical education': [
    'pe',
    'sport',
    'sports',
    'ciyaaraha',
    'jimicsi',
    'elimu ya viungo',
    'eps',
    'ስፖርት',
    'تربية بدنية',
    'التربية البدنية',
  ],
  art: [
    'arts',
    'fine art',
    'fine arts',
    'farshaxan',
    'sanaa',
    'dessin',
    'ሥነ ጥበብ',
    'ስነ ጥበብ',
    'فنون',
    'الفنون',
  ],
  music: ['muusik', 'muusikada', 'muziki', 'musique', 'ሙዚቃ', 'موسيقى'],
  tigrinya: ['tigrigna', 'tigrinia', 'ትግርኛ', 'التغرينية'],
  french: [
    'faransiis',
    'faransiiska',
    'kifaransa',
    'francais',
    'ፈረንሳይኛ',
    'فرنسي',
    'الفرنسية',
  ],
  swahili: ['kiswahili', 'sawaaxili', 'ስዋሂሊ', 'السواحلية'],
};
const SUBJECT_KEY_OF = new Map<string, string>();

/** Lowercase, accents and punctuation gone, one space between words. */
export function foldSubject(name: unknown): string {
  return String(name ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}
for (const [canon, aliases] of Object.entries(SUBJECT_ALIASES)) {
  SUBJECT_KEY_OF.set(foldSubject(canon), canon);
  for (const a of aliases) SUBJECT_KEY_OF.set(foldSubject(a), canon);
}

/** The one key a subject's spellings share: "Maths", "Math", "Xisaab" → "mathematics". */
export function subjectKey(name: unknown): string {
  const folded = foldSubject(name);
  if (!folded) return '';
  return SUBJECT_KEY_OF.get(folded) ?? folded;
}

/**
 * Whether a resource's subject and a timetable's are the same subject: the
 * same key, or one key inside the other ("science" / "integrated science",
 * "english" / "english literature") — never on a word under four letters,
 * so "art" does not reach "cartography".
 */
export function subjectMatches(a: unknown, b: unknown): boolean {
  const x = subjectKey(a);
  const y = subjectKey(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  if (short.length < 4) return false;
  return new RegExp(
    `(^|\\s)${short.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`,
  ).test(long);
}

/** (grade → subjects) off a set of `class|subject` timetable pairs. */
export function gradeSubjectsOfPairs(
  pairs: Iterable<string>,
): Map<number, string[]> {
  const out = new Map<number, string[]>();
  for (const pair of pairs) {
    const at = pair.indexOf('|');
    if (at < 0) continue;
    const grade = gradeNumberOf(pair.slice(0, at));
    const subject = pair.slice(at + 1).trim();
    if (grade == null || !subject) continue;
    const list = out.get(grade) ?? [];
    if (!list.some((s) => subjectKey(s) === subjectKey(subject)))
      list.push(subject);
    out.set(grade, list);
  }
  return new Map([...out.entries()].sort((a, b) => a[0] - b[0]));
}

/** The items a (grade → subjects) map reaches: the grade on the item, and its subject taught in that grade. */
export function cutToTaught(
  rows: SchoolCurriculumResource[],
  taught: Map<number, string[]>,
): SchoolCurriculumResource[] {
  return rows.filter((r) =>
    (r.grades ?? []).some((g) =>
      (taught.get(Number(g)) ?? []).some((s) => subjectMatches(s, r.subject)),
    ),
  );
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

  /**
   * The reader's copy. `teacherUrl` — a quiz's edit link, with its answers
   * — leaves the server for the platform's admins ONLY: the shelf is kept
   * centrally, so neither a teacher nor a school's office edits a quiz.
   */
  view(
    row: SchoolCurriculumResource,
    opts: { admin?: boolean } = {},
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
    if (opts.admin) {
      out.teacherUrl = row.teacherUrl ?? null;
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

  /** The live items listed for a grade, in shelf order. */
  private async rowsForGrade(grade: number | null) {
    if (grade == null) return [];
    const rows = await this.listActive();
    return rows.filter((r) =>
      (r.grades ?? []).some((g) => Number(g) === grade),
    );
  }

  /** The pupil's (and the family's) cut by grade alone, no teachers' links. */
  async forGrade(grade: number | null): Promise<CurriculumResourceView[]> {
    const rows = await this.rowsForGrade(grade);
    return rows.map((r) => this.view(r));
  }

  /**
   * The pupil's (and the family's) cut: their grade, and only the subjects
   * their class's timetable teaches — a Grade 8 pupil whose class has no
   * Mathematics lesson is not shown the Mathematics quizzes. A class with
   * no timetable yet falls back to the grade's whole shelf: an unpublished
   * timetable is not a decision that the class studies nothing.
   */
  async forPupil(
    grade: number | null,
    subjects: Iterable<unknown>,
  ): Promise<CurriculumResourceView[]> {
    const rows = await this.rowsForGrade(grade);
    const taught = [...subjects]
      .map((s) => String(s ?? '').trim())
      .filter(Boolean);
    const cut = taught.length
      ? rows.filter((r) => taught.some((s) => subjectMatches(s, r.subject)))
      : rows;
    return cut.map((r) => this.view(r));
  }

  /**
   * A member of staff's cut — the student links, as the pupils read them;
   * the edit links are the platform's and stay here.
   *
   * The heads (whoever is not held to a class scope) read the whole shelf.
   * A teacher reads ONLY the subjects and grades their timetable puts them
   * in front of — Ahmed, who takes Mathematics in 7th and 8th, sees the
   * Grade 7 and 8 Mathematics shelves and nothing of English; change his
   * timetable and his shelf changes with it. `scope` names those pairs so
   * the page can say what decided the cut; null = unscoped.
   */
  async forStaff(branchId: number, actor: ScopeActor) {
    const [rows, reach] = await Promise.all([
      this.listActive(),
      this.reachSvc
        ? this.reachSvc.resolve(branchId, actor)
        : Promise.resolve(null),
    ]);
    if (!reach || reach.head || !reach.classes) {
      return {
        items: rows.map((r) => this.view(r)),
        scope: null,
        grades: null,
      };
    }
    const taught = gradeSubjectsOfPairs(reach.pairs ?? []);
    const grades = [...taught.keys()];
    return {
      items: cutToTaught(rows, taught).map((r) => this.view(r)),
      scope: {
        grades,
        pairs: [...taught.entries()].flatMap(([grade, subjects]) =>
          subjects.map((subject) => ({ grade, subject })),
        ),
        hasTimetable: (reach.pairs?.size ?? 0) > 0,
      },
      grades,
    };
  }

  // ── the platform's admins ────────────────────────────────────────────────

  async adminList() {
    const rows = await this.repo.find();
    return {
      items: rows.sort(byShelf).map((r) => this.view(r, { admin: true })),
    };
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
