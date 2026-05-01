const fs = require('fs');
let code = fs.readFileSync('src/pos-sync/pos-sync.service.spec.ts', 'utf8');
code = code.replace(
`            if (entity === PosSyncJob) {
              return posSyncJobsRepository;
            }`,
`            if (entity === PosSyncJob) {
              return posSyncJobsRepository;
            }
            if (entity === Product) {
              return {
                findOne: jest.fn().mockResolvedValue({ id: 55, manageStock: true })
              };
            }`
);
code = code.replace(/import \{ PosSyncJob \} from '.\/entities\/pos-sync-job.entity';/g, "import { PosSyncJob } from './entities/pos-sync-job.entity';\nimport { Product } from '../products/entities/product.entity';");
fs.writeFileSync('src/pos-sync/pos-sync.service.spec.ts', code);
