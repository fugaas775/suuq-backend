const fs = require('fs');

const filepath = '/root/suuq-backend/src/branch-staff/branch-staff.service.ts';
let content = fs.readFileSync(filepath, 'utf8');

const missingCode = `
  async findByBranch(branchId: number) {
    return this.assignmentsRepository.find({
      where: { branchId, isActive: true },
      order: { createdAt: 'DESC' },
      relations: { user: true, branch: true },
    });
  }
`;

content = content.replace(/async unassign\([\s\S]*?\)\s*\{/, missingCode + '\n  $&');
fs.writeFileSync(filepath, content);
console.log('Restored findByBranch');
