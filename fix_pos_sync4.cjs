const fs = require('fs');
let code = fs.readFileSync('src/pos-sync/pos-sync.service.spec.ts', 'utf8');

code = code.replace(
`            if (entity === PosSyncJob) {
              return posSyncJobsRepository;
            }
            if (entity === Product) {
              return {
                find: jest.fn().mockImplementation(async (query) => {
                   let ids = (query && query.where && query.where.id && query.where.id.value) ? query.where.id.value : [9, 55, 78]; // fallback
                   return ids.map(id => ({ id, manageStock: true }));
                }),
                findOne: jest.fn().mockImplementation(async (query) => {
                   const id = query.where.id;
                   return { id: id, manageStock: true };
                })
              };
            }`,
`            if (entity === PosSyncJob) {
              return posSyncJobsRepository;
            }
            if (entity === Product) {
              return {
                findOne: jest.fn().mockImplementation(async (query) => {
                   const id = query?.where?.id || 55;
                   return { id: id, manageStock: true };
                }),
                find: jest.fn().mockImplementation(async (query) => {
                   return [{ id: 55, manageStock: true }];
                })
              };
            }`
);
fs.writeFileSync('src/pos-sync/pos-sync.service.spec.ts', code);
