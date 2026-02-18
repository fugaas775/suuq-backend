import 'dotenv/config';
import dataSource from '../src/data-source';
import { UiSetting } from '../src/settings/entities/ui-setting.entity';

async function run() {
  console.log('Initializing data source...');
  await dataSource.initialize();

  const repo = dataSource.getRepository(UiSetting);

  const settings = [
    {
      key: 'commission_rate',
      value: 3,
      description: 'Platform commission rate in percent (e.g. 3 for 3%)',
    },
    {
      key: 'delivery_base_fee',
      value: 100,
      description: 'Base fee for delivery in default currency',
    },
  ];

  for (const s of settings) {
    console.log(`Upserting setting: ${s.key} = ${s.value}`);
    const existing = await repo.findOne({ where: { key: s.key } });
    if (existing) {
      existing.value = s.value;
      existing.description = s.description;
      await repo.save(existing);
    } else {
      const created = repo.create(s);
      await repo.save(created);
    }
  }

  console.log('Done.');
  await dataSource.destroy();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
