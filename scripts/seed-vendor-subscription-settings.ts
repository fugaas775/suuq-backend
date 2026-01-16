import 'dotenv/config';
import dataSource from '../src/data-source';
import { UiSetting } from '../src/settings/entities/ui-setting.entity';

async function run() {
  console.log('Initializing data source...');
  await dataSource.initialize();

  const repo = dataSource.getRepository(UiSetting);

  const settings = [
    {
      key: 'vendor_subscription_base_price',
      value: 9.99,
      description: 'Base price for vendor subscription in USD',
    },
    {
      key: 'vendor_subscription_fees',
      value: 0.50,
      description: 'Additional fees for vendor subscription in USD',
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
