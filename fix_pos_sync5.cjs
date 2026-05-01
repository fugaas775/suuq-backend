const fs = require('fs');
let code = fs.readFileSync('src/pos-sync/pos-sync.service.spec.ts', 'utf8');

code = code.replace(
`    dataSource = {
      transaction: jest.fn(async (callback) =>
        callback({
          getRepository: jest.fn((entity) => {
            if (entity === PosSyncJob) {
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
            }

            return null;
          }),
        }),
      ),
    };`,
`    dataSource = {
      manager: {
        getRepository: jest.fn((entity) => {
            if (entity === Product) {
              return {
                findOne: jest.fn().mockImplementation(async (query) => {
                   const id = query?.where?.id || 55;
                   return { id: id, manageStock: true };
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
                   const id = query?.where?.id || 55;
                   return { id: id, manageStock: true };
                }),
              };
            }
            return null;
          }),
        }),
      ),
    };`
);
fs.writeFileSync('src/pos-sync/pos-sync.service.spec.ts', code);
