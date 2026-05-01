const fs = require('fs');
let code = fs.readFileSync('src/pos-sync/pos-sync.service.spec.ts', 'utf8');

code = code.replace(/import \{ PosSyncJob \} from '.\/entities\/pos-sync-job.entity';/g, "import { PosSyncJob } from './entities/pos-sync-job.entity';\nimport { Product } from '../products/entities/product.entity';");

code = code.replace(
`      transaction: jest.fn(async (callback) =>
        callback({
          getRepository: jest.fn((entity) => {
            if (entity === PosSyncJob) {
              return posSyncJobsRepository;
            }

            return null;
          }),
        }),
      ),`,
`      manager: {
        getRepository: jest.fn((entity) => {
            if (entity === Product) {
              return {
                findOne: jest.fn().mockImplementation(async (query) => {
                   const id = query?.where?.id;
                   return { id: id || 9, manageStock: true };
                }),
              };
            }
            return null;
        }),
      },
      transaction: jest.fn(async (callback) =>
        callback({
          getRepository: jest.fn((entity) => {
            if (entity === PosSyncJob) {
              return posSyncJobsRepository;
            }
            if (entity === Product) {
              return {
                findOne: jest.fn().mockImplementation(async (query) => {
                   const id = query?.where?.id;
                   return { id: id || 9, manageStock: true };
                }),
              };
            }
            return null;
          }),
        }),
      ),
`
);

fs.writeFileSync('src/pos-sync/pos-sync.service.spec.ts', code);
