// scripts/rebuild-closure.ts
import 'reflect-metadata';
import { AppDataSource } from '../src/data-source';
import { Category } from '../src/categories/entities/category.entity';

async function rebuildCategoryClosureTable() {
  console.log('Initializing data source...');
  await AppDataSource.initialize();
  console.log('Data source initialized successfully.');

  const categoryRepository = AppDataSource.getRepository(Category);

  console.log('Starting closure table rebuild for Category...');

  try {
    await AppDataSource.transaction(async (transactionalEntityManager) => {
      const queryRunner = transactionalEntityManager.queryRunner!;

      // --- WORKAROUND ---
      // We are hardcoding the table name because TypeORM's metadata is generating it incorrectly.
      // This is the most direct way to fix the "category_closure_closure" issue.
      const closureTableName = 'category_closure';

      // 1. Clear the closure table
      console.log(`Truncating closure table "${closureTableName}"...`);
      // Use the raw table name directly in the query.
      await queryRunner.query(`TRUNCATE TABLE "${closureTableName}" RESTART IDENTITY`);

      // 2. Get all categories
      const allCategories = await categoryRepository.find({ relations: ['parent'] });
      console.log(`Found ${allCategories.length} categories to process.`);

      if (allCategories.length === 0) {
        console.log('No categories found. Exiting.');
        return;
      }
      
      // 3. Manually rebuild closure table relationships in memory
      const closureInserts: { id_ancestor: number; id_descendant: number }[] = [];
      const categoryMap = new Map(allCategories.map(c => [c.id, c]));

      for (const category of allCategories) {
        let current: Category | undefined = category;
        while (current) {
          closureInserts.push({
            id_ancestor: current.id,
            id_descendant: category.id,
          });
          current = current.parent ? categoryMap.get(current.parent.id) : undefined;
        }
      }
      
      console.log(`Generated ${closureInserts.length} closure relationships.`);

      // 4. Bulk-insert the new closure data
      if (closureInserts.length > 0) {
        console.log('Bulk inserting new closure relationships...');
        await transactionalEntityManager
          .createQueryBuilder()
          .insert()
          .into(closureTableName) // Use the hardcoded variable here as well
          .values(closureInserts)
          .execute();
      }
    });

    console.log('✅ Closure table rebuild completed successfully!');

  } catch (error) {
    console.error('❌ Failed to rebuild closure table:', error);
  } finally {
    console.log('Destroying data source connection...');
    await AppDataSource.destroy();
    console.log('Connection destroyed.');
  }
}

rebuildCategoryClosureTable();