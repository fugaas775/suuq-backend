const fs = require('fs');
let code = fs.readFileSync('src/pos-sync/pos-sync.service.spec.ts', 'utf8');
code = code.replace(
`            if (entity === Product) {
              return {
                findOne: jest.fn().mockResolvedValue({ id: 55, manageStock: true })
              };
            }`,
`            if (entity === Product) {
              return {
                findOne: jest.fn().mockImplementation(async (query) => {
                   const id = query.where.id;
                   return { id: id, manageStock: true, ...query.where };
                })
              };
            }`
);
fs.writeFileSync('src/pos-sync/pos-sync.service.spec.ts', code);
