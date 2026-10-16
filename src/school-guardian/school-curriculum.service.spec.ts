import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  SchoolCurriculumService,
  gradeNumberOf,
  gradesOfClasses,
} from './school-curriculum.service';
import { memRepo, reachStub } from './test/memory-repo';

/* The curriculum shelf: platform content every school reads, cut to each
   reader's grade; the teachers' links never reach a pupil or a family. */

const row = (over: Record<string, unknown>) => ({
  kind: 'ITEM_BANK',
  subject: 'Mathematics',
  series: null,
  title: 'x',
  grades: [8],
  studentUrl: `https://forms.example/${Math.random()}`,
  teacherUrl: 'https://forms.example/edit',
  questions: 10,
  note: null,
  sortOrder: 0,
  isActive: true,
  ...over,
});

function make(rows: any[] = []) {
  const repo = memRepo(rows);
  const reach = reachStub((actor) => {
    if (actor.id === 30)
      return {
        head: false,
        classes: ['7th', '8th a'],
        assigned: ['7th'],
        pairs: ['7th|maths', '8th a|maths'],
        employee: { id: 30, fullName: 'Mustafe' },
      };
    if (actor.id === 31)
      return {
        head: false,
        classes: ['kg ii'],
        assigned: ['kg ii'],
        pairs: [],
        employee: { id: 31, fullName: 'Deq' },
      };
    return { head: true, employee: null, name: 'Suuq S' };
  });
  return { svc: new SchoolCurriculumService(repo, reach as any), rows };
}

describe('gradeNumberOf', () => {
  it('reads the grade off the codes the schools write', () => {
    expect(gradeNumberOf('7th')).toBe(7);
    expect(gradeNumberOf('8aad')).toBe(8);
    expect(gradeNumberOf('3aad B')).toBe(3);
    expect(gradeNumberOf('Grade 7')).toBe(7);
    expect(gradeNumberOf('G7')).toBe(7);
    expect(gradeNumberOf('Fasalka 9')).toBe(9);
    expect(gradeNumberOf('10th')).toBe(10);
    expect(gradeNumberOf('1aad')).toBe(1);
  });
  it('gives no grade to a nursery, a KG or an empty code', () => {
    expect(gradeNumberOf('KG II')).toBeNull();
    expect(gradeNumberOf('KG 1')).toBeNull();
    expect(gradeNumberOf('Nursery')).toBeNull();
    expect(gradeNumberOf('')).toBeNull();
    expect(gradeNumberOf(null)).toBeNull();
    expect(gradeNumberOf('0th')).toBeNull();
    expect(gradeNumberOf('123')).toBeNull();
  });
  it('spans a set of classes to distinct ascending grades', () => {
    expect(gradesOfClasses(['8th', '7th', '8th b', 'kg ii'])).toEqual([7, 8]);
    expect(gradesOfClasses([])).toEqual([]);
  });
});

describe('SchoolCurriculumService', () => {
  it('cuts the shelf to the pupil’s grade and keeps the teachers’ link back', async () => {
    const { svc } = make([
      row({ id: 1, title: 'G7 U1', grades: [7, 8], series: 'Grade 7 Mathematics', sortOrder: 10 }),
      row({ id: 2, title: 'G8 U1', grades: [8], series: 'Grade 8 Mathematics', sortOrder: 10 }),
      row({ id: 3, title: 'Mock 1', grades: [8], series: 'Mock regional exams', sortOrder: 10 }),
      row({ id: 4, title: 'Taken down', grades: [7, 8], isActive: false }),
    ]);
    const g7 = await svc.forGrade(7);
    expect(g7.map((r) => r.title)).toEqual(['G7 U1']);
    expect(g7[0]).not.toHaveProperty('teacherUrl');
    expect(g7[0]).not.toHaveProperty('isActive');
    const g8 = await svc.forGrade(8);
    expect(g8.map((r) => r.title)).toEqual(['G7 U1', 'G8 U1', 'Mock 1']);
    expect(await svc.forGrade(3)).toEqual([]);
    expect(await svc.forGrade(null)).toEqual([]);
  });

  it('hands the staff the whole live shelf with the teachers’ links, and the grades their classes span', async () => {
    const { svc } = make([
      row({ id: 1, title: 'G7 U1', grades: [7, 8] }),
      row({ id: 2, title: 'G8 U1', grades: [8] }),
      row({ id: 3, title: 'G3', grades: [3] }),
      row({ id: 4, title: 'Off', grades: [8], isActive: false }),
    ]);
    const teacher = await svc.forStaff(128, { id: 30, email: 't@x', roles: ['POS_OPERATOR'] });
    expect(teacher.grades).toEqual([7, 8]);
    // Shelf order: subject, series, sortOrder, then the order listed.
    expect(teacher.items.map((r) => r.title)).toEqual(['G7 U1', 'G8 U1', 'G3']);
    expect(teacher.items[0].teacherUrl).toBe('https://forms.example/edit');
    // A KG teacher spans no grade — the page shows the whole shelf.
    const kg = await svc.forStaff(128, { id: 31, email: 'k@x', roles: ['POS_OPERATOR'] });
    expect(kg.grades).toEqual([]);
    // The heads reach every class: no grades to lead with.
    const head = await svc.forStaff(128, { id: 1, email: 'o@x', roles: ['POS_MANAGER'] });
    expect(head.grades).toBeNull();
  });

  it('an admin lists, adds, edits, takes down and removes — and a student link is listed once', async () => {
    const { svc, rows } = make([row({ id: 1, title: 'Old', studentUrl: 'https://forms.example/old' })]);
    const made = await svc.create(
      {
        kind: 'ITEM_BANK',
        subject: ' Mathematics ',
        series: 'Grade 8 Mathematics',
        title: 'Grade 8 – Unit 1',
        grades: [8, 8, 7],
        studentUrl: 'https://forms.example/new',
        teacherUrl: 'https://forms.example/new/edit',
        questions: 10,
      },
      { id: 5, name: 'Suuq S' },
    );
    expect(made).toMatchObject({ subject: 'Mathematics', grades: [7, 8], teacherUrl: 'https://forms.example/new/edit', isActive: true });
    expect(rows.find((r) => r.id === made.id)).toMatchObject({ createdByUserId: 5, createdByName: 'Suuq S' });
    await expect(
      svc.create({ kind: 'TEXTBOOK_PDF', subject: 'Maths', title: 'Dup', grades: [8], studentUrl: 'https://forms.example/old' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const edited = await svc.update(made.id, { series: '', teacherUrl: '', questions: null, isActive: false, grades: [8] });
    expect(edited).toMatchObject({ series: null, teacherUrl: null, questions: null, isActive: false, grades: [8] });
    // Off the shelf for every reader now.
    expect((await svc.forGrade(8)).map((r) => r.title)).toEqual(['Old']);
    const all = await svc.adminList();
    // An unshelved item (no series) sorts before a shelved one.
    expect(all.items.map((r) => [r.title, r.isActive])).toEqual([['Old', true], ['Grade 8 – Unit 1', false]]);

    expect(await svc.remove(made.id)).toEqual({ status: 'DELETED', id: made.id });
    await expect(svc.remove(made.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.update(999, { title: 'x' })).rejects.toBeInstanceOf(NotFoundException);
  });
});
