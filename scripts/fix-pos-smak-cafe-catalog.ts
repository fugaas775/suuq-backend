/**
 * fix-pos-smak-cafe-catalog.ts
 *
 * Data-fix script for SMAK Cafe & Restaurant (branch 44).
 *
 * Problems addressed:
 *   1. LOCAL_SKU:PACKING-CHARGE  — POS-S sends a packaging-charge line for
 *      to-go orders; the backend has no product alias for it, so those
 *      checkouts land in FAILED status.
 *      Fix: create a "Packing Charge" service product and a tenant-scoped
 *      product alias LOCAL_SKU:PACKING-CHARGE → that product.
 *
 *   2. Inventory for branch 44 / product 900 cannot go negative  — product 900
 *      is a made-to-order menu item that was incorrectly flagged with
 *      manageStock = true.  The backend tries to deduct from an empty inventory
 *      record and blocks the checkout.
 *      Fix: set manageStock = false on product 900 and add a safety opening
 *      stock adjustment of 1 000 units so that any existing outstanding orders
 *      that are still in FAILED status can be retried without issue.
 *
 *   3. Tax rate mismatch — the branch is collecting 15 % VAT on food items
 *      but product 900 has taxRate = null in the backend catalog, causing the
 *      tax-summary report to bucket it as "zero-rated" even though the checkout
 *      lines carry a non-zero taxAmount.
 *      Fix: set taxRate = 0.15 on product 900.
 *
 * Usage:
 *   cd /root/suuq-backend
 *   npx ts-node -r tsconfig-paths/register scripts/fix-pos-smak-cafe-catalog.ts
 */

import 'dotenv/config';
import dataSource from '../src/data-source';
import { Product } from '../src/products/entities/product.entity';
import {
  ProductAlias,
  ProductAliasType,
} from '../src/product-aliases/entities/product-alias.entity';
import { Branch } from '../src/branches/entities/branch.entity';
import { BranchInventory } from '../src/branches/entities/branch-inventory.entity';
import {
  StockMovement,
  StockMovementType,
} from '../src/branches/entities/stock-movement.entity';
import { User } from '../src/users/entities/user.entity';

const TARGET_BRANCH_ID = 44;
const TARGET_PRODUCT_ID = 900;
const PACKING_CHARGE_SKU = 'PACKING-CHARGE';
const OPENING_STOCK_QTY = 1000;

async function run() {
  console.log('Initializing data source…');
  await dataSource.initialize();

  await dataSource.transaction(async (manager) => {
    // -----------------------------------------------------------------------
    // Step 0: resolve tenant for branch 44
    // -----------------------------------------------------------------------
    const branch = await manager.getRepository(Branch).findOne({
      where: { id: TARGET_BRANCH_ID },
    });
    if (!branch) {
      throw new Error(`Branch ${TARGET_BRANCH_ID} not found`);
    }
    if (branch.retailTenantId == null) {
      throw new Error(`Branch ${TARGET_BRANCH_ID} has no retail tenant`);
    }
    const tenantId = branch.retailTenantId;
    console.log(`Branch ${TARGET_BRANCH_ID} → retail tenant ${tenantId}`);

    // -----------------------------------------------------------------------
    // Step 1: Fix product 900 — manageStock + taxRate
    // -----------------------------------------------------------------------
    const product900 = await manager.getRepository(Product).findOne({
      where: { id: TARGET_PRODUCT_ID },
    });
    if (!product900) {
      console.warn(
        `⚠  Product ${TARGET_PRODUCT_ID} not found — skipping product-900 fixes`,
      );
    } else {
      const needsManageStock = product900.manageStock !== false;
      const needsTaxRate =
        product900.taxRate == null || product900.taxRate === 0;
      if (needsManageStock || needsTaxRate) {
        product900.manageStock = false;
        product900.taxRate = 0.15;
        await manager.getRepository(Product).save(product900);
        console.log(
          `✓ Product ${TARGET_PRODUCT_ID}: manageStock → false, taxRate → 0.15`,
        );
      } else {
        console.log(
          `  Product ${TARGET_PRODUCT_ID} already has correct settings`,
        );
      }
    }

    // -----------------------------------------------------------------------
    // Step 2: Add opening stock adjustment for product 900 at branch 44
    //         (safety net so outstanding FAILED checkouts can be retried)
    // -----------------------------------------------------------------------
    if (product900) {
      const inventoryRepo = manager.getRepository(BranchInventory);
      const movementRepo = manager.getRepository(StockMovement);

      let inv = await inventoryRepo.findOne({
        where: { branchId: TARGET_BRANCH_ID, productId: TARGET_PRODUCT_ID },
      });

      if (!inv) {
        inv = inventoryRepo.create({
          branchId: TARGET_BRANCH_ID,
          productId: TARGET_PRODUCT_ID,
          quantityOnHand: 0,
          reservedQuantity: 0,
          reservedOnline: 0,
          reservedStoreOps: 0,
          inboundOpenPo: 0,
          outboundTransfers: 0,
          safetyStock: 0,
          availableToSell: 0,
          version: 0,
        });
      }

      if (inv.quantityOnHand < OPENING_STOCK_QTY) {
        const delta = OPENING_STOCK_QTY - inv.quantityOnHand;
        inv.quantityOnHand = OPENING_STOCK_QTY;
        inv.availableToSell = OPENING_STOCK_QTY;
        inv.version = (inv.version ?? 0) + 1;
        await inventoryRepo.save(inv);

        await movementRepo.save(
          movementRepo.create({
            branchId: TARGET_BRANCH_ID,
            productId: TARGET_PRODUCT_ID,
            movementType: StockMovementType.ADJUSTMENT,
            quantityDelta: delta,
            sourceType: 'ADMIN_SCRIPT',
            note: 'Opening stock correction — product was incorrectly flagged manageStock=true with zero inventory',
          }),
        );
        console.log(
          `✓ Opening stock for product ${TARGET_PRODUCT_ID} at branch ${TARGET_BRANCH_ID}: +${delta} units (total ${OPENING_STOCK_QTY})`,
        );
      } else {
        console.log(
          `  Product ${TARGET_PRODUCT_ID} already has ${inv.quantityOnHand} units at branch ${TARGET_BRANCH_ID}`,
        );
      }
    }

    // -----------------------------------------------------------------------
    // Step 3: Create / locate a service product for the packing charge
    // -----------------------------------------------------------------------
    const productRepo = manager.getRepository(Product);

    let packingProduct = await productRepo.findOne({
      where: { sku: PACKING_CHARGE_SKU },
    });

    if (!packingProduct) {
      // Resolve a vendor user to satisfy the NOT NULL constraint.
      // Use the first SUPER_ADMIN / ADMIN user, or fall back to the branch
      // owner if resolvable.
      const adminUser = await manager
        .getRepository(User)
        .createQueryBuilder('u')
        .where(
          "u.roles::text LIKE '%SUPER_ADMIN%' OR u.roles::text LIKE '%ADMIN%'",
        )
        .orderBy('u.id', 'ASC')
        .limit(1)
        .getOne();

      if (!adminUser) {
        throw new Error(
          'No admin user found — cannot create packing charge product',
        );
      }

      packingProduct = productRepo.create({
        name: 'Packing Charge',
        sku: PACKING_CHARGE_SKU,
        description: 'Automatic packaging charge applied to to-go orders',
        price: 0,
        currency: 'ETB',
        taxRate: 0,
        manageStock: false,
        isBlocked: false,
        vendor: adminUser,
        createdById: adminUser.id,
        createdByName: adminUser.displayName ?? adminUser.email ?? 'System',
      } as Partial<Product> as Product);

      packingProduct = await productRepo.save(packingProduct);
      console.log(
        `✓ Created packing charge product id=${packingProduct.id}, sku=${PACKING_CHARGE_SKU}`,
      );
    } else {
      console.log(
        `  Packing charge product already exists id=${packingProduct.id}`,
      );
    }

    // -----------------------------------------------------------------------
    // Step 4: Create tenant-scoped product alias LOCAL_SKU:PACKING-CHARGE
    // -----------------------------------------------------------------------
    const aliasRepo = manager.getRepository(ProductAlias);
    // Must match the backend's normalizeAliasValue: value.trim().toLowerCase()
    const normalizedAliasValue = PACKING_CHARGE_SKU.trim().toLowerCase();

    const existingAlias = await aliasRepo.findOne({
      where: {
        tenantId,
        aliasType: ProductAliasType.LOCAL_SKU,
        normalizedAliasValue,
        branchId: null as any,
        partnerCredentialId: null as any,
      },
    });

    if (!existingAlias) {
      await aliasRepo.save(
        aliasRepo.create({
          tenantId,
          branchId: null,
          partnerCredentialId: null,
          productId: packingProduct.id,
          aliasType: ProductAliasType.LOCAL_SKU,
          aliasValue: PACKING_CHARGE_SKU,
          normalizedAliasValue,
          isActive: true,
          metadata: {
            source: 'fix-pos-smak-cafe-catalog',
            note: 'Packing charge for POS to-go orders',
          },
        }),
      );
      console.log(
        `✓ Created product alias LOCAL_SKU:${PACKING_CHARGE_SKU} → product ${packingProduct.id} (tenant ${tenantId})`,
      );
    } else {
      console.log(
        `  Alias LOCAL_SKU:${PACKING_CHARGE_SKU} already exists → product ${existingAlias.productId}`,
      );
    }

    console.log('\nAll fixes applied successfully.');
  });

  await dataSource.destroy();
}

run().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
