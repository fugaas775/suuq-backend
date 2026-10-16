import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The curriculum shelf every school on the SCHOOL format reads — textbook
 * PDFs, slides and item banks the platform lists once, cut to each reader's
 * grade. Platform content: no branchId. Seeded with the first shelf, the
 * owner's Grade 7 and 8 Mathematics item banks (2026-10-16): one Google
 * Form quiz per unit and two mock regional exams. The Grade 8 regional
 * exam draws on both years' work, so the Grade 7 units are listed for
 * grades 7 AND 8; the Grade 8 units and the mocks for grade 8.
 *
 * Idempotent: the student link is unique, and the seed skips a link already
 * listed — re-running adds nothing and changes nothing an admin edited.
 */
export class AddSchoolCurriculumResources20261016150000
  implements MigrationInterface
{
  name = 'AddSchoolCurriculumResources20261016150000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pos_school_curriculum_resources" (
        "id" BIGSERIAL PRIMARY KEY,
        "kind" character varying(32) NOT NULL,
        "subject" character varying(120) NOT NULL,
        "series" character varying(120),
        "title" character varying(200) NOT NULL,
        "grades" integer[] NOT NULL DEFAULT '{}',
        "studentUrl" text NOT NULL,
        "teacherUrl" text,
        "questions" integer,
        "note" text,
        "sortOrder" integer NOT NULL DEFAULT 0,
        "isActive" boolean NOT NULL DEFAULT true,
        "createdByUserId" integer,
        "createdByName" character varying(160),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_pos_school_curriculum_resources_student_url"
        ON "pos_school_curriculum_resources" ("studentUrl")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_pos_school_curriculum_resources_active"
        ON "pos_school_curriculum_resources" ("isActive")
    `);

    for (const r of SEED) {
      await queryRunner.query(
        `INSERT INTO "pos_school_curriculum_resources"
           ("kind", "subject", "series", "title", "grades", "studentUrl", "teacherUrl", "questions", "sortOrder", "createdByName")
         VALUES ('ITEM_BANK', 'Mathematics', $1, $2, $3::int[], $4, $5, $6, $7, 'Suuq S')
         ON CONFLICT ("studentUrl") DO NOTHING`,
        [
          r.series,
          r.title,
          r.grades,
          r.studentUrl,
          r.teacherUrl,
          r.questions,
          r.sortOrder,
        ],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS "pos_school_curriculum_resources"`,
    );
  }
}

const G7 = 'Grade 7 Mathematics';
const G8 = 'Grade 8 Mathematics';
const MOCK = 'Mock regional exams';
const form = (student: string, edit: string) => ({
  studentUrl: `https://docs.google.com/forms/d/e/${student}/viewform`,
  teacherUrl: `https://docs.google.com/forms/d/${edit}/edit`,
});

const SEED = [
  { series: G7, title: 'Grade 7 – Unit 1: Basic Concepts of Sets', grades: [7, 8], questions: 10, sortOrder: 10, ...form('1FAIpQLSdS62rplQz0rReakBkg47IsK_0dFZg2H65VcmeX_nm9kmHF7A', '1NBgcQNl3oKFRZPZSGaH0gc_aPVP53M-SHKvDE9onPfk') },
  { series: G7, title: 'Grade 7 – Unit 2: Integers', grades: [7, 8], questions: 10, sortOrder: 20, ...form('1FAIpQLSeSKAXqIh-LGIEA4qcfLDvT8CxLFnjzZ2KcXhxgP-AGa0GAKw', '1OomQv21FMU1F-DAVhjHxgfnMxwyDesmsqFXABoLwzPM') },
  { series: G7, title: 'Grade 7 – Unit 3: Ratio, Proportion and Percentage', grades: [7, 8], questions: 10, sortOrder: 30, ...form('1FAIpQLSfizrNRkMD4jH0WStlHKX_l-Lapj_Mxs-rRPcfBci1C3lK4Lw', '1ikwfFBwtZjl7jsuvLomOv9BbepWvyZYtULPROhKGauc') },
  { series: G7, title: 'Grade 7 – Unit 4: Linear Equations', grades: [7, 8], questions: 10, sortOrder: 40, ...form('1FAIpQLSeQkF6MNgWHkXK2VN6SCV-U9LrV7UOCms2gGO5M4rSjVhxgSQ', '1Lf9HSIEGP5QwFCp8h694XnOeQ0-j_6lJnIUoj1OX9Ec') },
  { series: G7, title: 'Grade 7 – Unit 5: Perimeter and Area of Plane Figures', grades: [7, 8], questions: 10, sortOrder: 50, ...form('1FAIpQLSdw8M1QZNUahBwpzYDjX7UACxizgtXgp5o3CLZYSGj-q9_zbw', '1GbmbYPQFR_lTlyPOz1ogfMeEBHZ1vY-PDrHBJkYRM6s') },
  { series: G7, title: 'Grade 7 – Unit 6: Congruency of Plane Figures', grades: [7, 8], questions: 10, sortOrder: 60, ...form('1FAIpQLSdKIwCHPebXuiG0p_oq2HITxsh-Hpk1QEnP5N4XGgMMLL4Vkw', '17KsRasWC08yX6ky6i_wYS6OnMazvFrg6o38OEROb29E') },
  { series: G7, title: 'Grade 7 – Unit 7: Data Handling', grades: [7, 8], questions: 10, sortOrder: 70, ...form('1FAIpQLSdNXtUu3Xt4nyC3zO4qS0tVLKcnuI8L_HHnKvJTjHvuh8CgGA', '1uzwefBzxaGi80tuQCvMXxAxz4aRKAtGOYlu3PEEC9KY') },
  { series: G8, title: 'Grade 8 – Unit 1: Rational Numbers', grades: [8], questions: 10, sortOrder: 110, ...form('1FAIpQLScXZOvCwPPOGwWsSVYamMjV7J0sP0D5CNbTrGJqYfg3Ue2sfA', '1KeSxvu0sxC_2NMGBYnQ6NwOQr19WTSUj1yFmMygyUFE') },
  { series: G8, title: 'Grade 8 – Unit 2: Squares, Square Roots, Cubes and Cube Roots', grades: [8], questions: 10, sortOrder: 120, ...form('1FAIpQLSfG4mPtwMfFbnIb0ScxfCWI5ETFNimdhpadweOZkpWmCF4nrQ', '1Hlx3eaHGRVn_UyLzhOcuyGUx97uAfHj-SoMvN3-ntGU') },
  { series: G8, title: 'Grade 8 – Unit 3: Linear Equations and Inequalities', grades: [8], questions: 10, sortOrder: 130, ...form('1FAIpQLSeDs3s7tgwIVKfg6MRNgkBPZfnmcRbpZ-rKohq1WpU9cCf_iQ', '1ktzNSYXGCm6Jc0cq5zUa8Jb8geJ6PZPf99OG6_EStwA') },
  { series: G8, title: 'Grade 8 – Unit 4: Similarity of Figures', grades: [8], questions: 10, sortOrder: 140, ...form('1FAIpQLScpruh-mMmj4hVLadKsdfIT4ep44jstZQnnKwk7fZFGX7U_Qw', '1ibuqLs2RBKBZ40GuND_eiy10wG94ZtA6F6gavRj-0PY') },
  { series: G8, title: 'Grade 8 – Unit 5: Theorems on Triangles', grades: [8], questions: 10, sortOrder: 150, ...form('1FAIpQLSeLX7sM9vV0Yr_zkhy7dNV0z59HcfvjlaNV-rgtYevGJk960g', '13nY8V3X-SmgX55B7kgDDwYKiX11aaqwu09ZL5KT58BQ') },
  { series: G8, title: 'Grade 8 – Unit 6: Lines and Angles in a Circle', grades: [8], questions: 10, sortOrder: 160, ...form('1FAIpQLSf_w7v_muqlDUPpjkRsejieAvyKk95EuhOpXnlO0i1LJs1lEA', '1FxCOkHg2At0h_DLK8NK5H-fEk8We56Z7Tj0uYZPwqeE') },
  { series: G8, title: 'Grade 8 – Unit 7: Solid Figures and Measurements', grades: [8], questions: 10, sortOrder: 170, ...form('1FAIpQLSdN41ItS2-MwqtJs_C_WdVLRDLKIfQFFKChWuBijQQ87wRqlg', '1iVXMa7p9LJBI423roDqz_sOwv9YVYgmQJLFaQOX_cds') },
  { series: G8, title: 'Grade 8 – Unit 8: Introduction to Probability', grades: [8], questions: 10, sortOrder: 180, ...form('1FAIpQLSfbmZabJEYPRWz6DxMvNcvHl4DBQCrAi39d3sr9sHMn2K2Umw', '1ibxIMZF5Rza9BCRfj-r0fdygImcnkMzS41KLF_GnT6A') },
  { series: MOCK, title: 'Mock Regional Exam 1', grades: [8], questions: 30, sortOrder: 210, ...form('1FAIpQLSdaURootqW_oPSe7b31G0Lr9iUVHXiRBNrtohmi5fbIuPeJBw', '1nBM0dWWBM4k1y1tPwTvIz7YX3OgXeaSduKKcJPUEbNA') },
  { series: MOCK, title: 'Mock Regional Exam 2', grades: [8], questions: 30, sortOrder: 220, ...form('1FAIpQLScSf1gua96aw9Zt6zaiPtaOkHpORs4ZR_RjNg5sV7-Xb4GX7A', '1m_-VqY5W2lPhMd5nMGJxtQyBXHYtH4JLlTM-JDtqjLM') },
];
