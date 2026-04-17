import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { Branch } from '../src/branches/entities/branch.entity';
import { RetailTenant } from '../src/retail/entities/retail-tenant.entity';
import {
  RetailModule,
  TenantModuleEntitlement,
} from '../src/retail/entities/tenant-module-entitlement.entity';

function hasExecuteFlag() {
  return process.argv.includes('--execute');
}

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const dataSource = app.get(DataSource);
  const branchesRepository = dataSource.getRepository(Branch);
  const tenantsRepository = dataSource.getRepository(RetailTenant);
  const entitlementsRepository = dataSource.getRepository(
    TenantModuleEntitlement,
  );
  const execute = hasExecuteFlag();

  console.log(
    execute
      ? 'Executing self-serve branch serviceFormat backfill...'
      : 'Dry run: self-serve branch serviceFormat backfill...',
  );

  const tenants = await tenantsRepository.find({
    relations: { branches: true, entitlements: true },
    order: { id: 'ASC' },
  });

  const candidates = tenants.flatMap((tenant) => {
    const posCoreEntitlement = (tenant.entitlements || []).find(
      (entitlement) =>
        entitlement.module === RetailModule.POS_CORE &&
        entitlement.enabled &&
        String(entitlement.reason || '')
          .toLowerCase()
          .includes('self-serve onboarding'),
    );

    if (!posCoreEntitlement) {
      return [];
    }

    return (tenant.branches || []).filter((branch) => {
      return branch.isActive && !String(branch.serviceFormat || '').trim();
    });
  });

  if (!candidates.length) {
    console.log(
      'No legacy self-serve branches with blank serviceFormat were found.',
    );
    await app.close();
    return;
  }

  for (const branch of candidates) {
    console.log(
      `- branchId=${branch.id} tenantId=${branch.retailTenantId} branchName=${branch.name} currentServiceFormat=${branch.serviceFormat || 'NULL'} -> RETAIL`,
    );
  }

  if (!execute) {
    console.log(
      `Dry run complete. ${candidates.length} branch(es) would be updated.`,
    );
    await app.close();
    return;
  }

  for (const branch of candidates) {
    branch.serviceFormat = 'RETAIL';
    await branchesRepository.save(branch);
  }

  console.log(`Updated ${candidates.length} branch(es) to RETAIL.`);
  await app.close();
}

bootstrap().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
