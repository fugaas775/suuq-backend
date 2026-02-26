
import dataSource from '../src/ormconfig';

async function run() {
  await dataSource.initialize();
  
  const result = await dataSource.query(`
    select id, "total", "couponCode", "discountAmount" from "order" where id = 264
  `);
  
  console.log(JSON.stringify(result, null, 2));
  await dataSource.destroy();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
