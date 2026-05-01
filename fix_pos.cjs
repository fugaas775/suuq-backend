const fs = require('fs');
let code = fs.readFileSync('src/pos-sync/pos-sync.service.spec.ts', 'utf8');

code = code.replace(
`      manager: {
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
      },`,
`      manager: {
        getRepository: jest.fn((entity) => {
            if (entity === Product) {
              return {
                findOne: jest.fn().mockImplementation(async (query) => {
                   const id = query?.where?.id;
                   return { id: id, manageStock: true };
                }),
              };
            }
            return null;
        }),
      },`
);

// wait actually let's just make it return a real product object for any getRepository(Product)
code = code.replace(
`      transaction: jest.fn(async (callback) =>
        callback({
          getRepository: jest.fn((entity) => {
            if (entity === PosSyncJob) {
              return posSyncJobsRepository;
            }
            if (entity === Product) {
              return {
                findOne: jest.fn().mockImplementation(async (query) => {
                   const id = query?.where?.id;
                   return { id: id, manageStock: true };
                }),
              };
            }
            return null;
          }),
        }),
      ),`,
`      transaction: jest.fn(async (callback) =>
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
      getRepository: jest.fn((entity) => {
         if (entity === Product) {
              return {
                findOne: jest.fn().mockImplementation(async (query) => {
                   const id = query?.where?.id;
                   return { id: id || 9, manageStock: true };
                }),
              };
         }
      })`
);

fs.writeFileSync('src/pos-sync/pos-sync.service.spec.ts', code);
