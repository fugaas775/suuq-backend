const fs = require('fs');
const content = fs.readFileSync('src/deliverer/deliverer.service.ts', 'utf8');

const availableOrdersFunc = `
  async getAvailableOrders() {
    const orders = await this.orderRepository
      .createQueryBuilder('o')
      .leftJoinAndSelect('o.user', 'user')
      .leftJoinAndSelect('o.items', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .leftJoinAndSelect('product.vendor', 'vendor')
      .where('o.delivererId IS NULL')
      .andWhere("o.status IN ('PENDING', 'PROCESSING', 'SHIPPED')")
      .orderBy('o.createdAt', 'DESC')
      .getMany();

    return orders.map((o) => {
      const vendorsMap = new Map<
        number,
        {
          id: number;
          displayName?: string | null;
          storeName?: string | null;
          phone?: string | null;
          phoneCountryCode?: string | null;
        }
      >();
      for (const it of o.items || []) {
        const v: any = (it as any).product?.vendor;
        if (v?.id && !vendorsMap.has(v.id)) {
          vendorsMap.set(v.id, {
            id: v.id,
            displayName: v.displayName || null,
            storeName: v.storeName || null,
            phone: v.vendorPhoneNumber || v.phoneNumber || null,
            phoneCountryCode: v.phoneCountryCode || null,
          });
        }
      }
      const vendors = Array.from(vendorsMap.values());
      return {
        ...o,
        vendors,
        vendorName:
          vendors.length === 1
            ? vendors[0].storeName || vendors[0].displayName || null
            : null,
      } as any;
    });
  }
`;

const updated = content.replace(
  'async getMyAssignments(delivererId: number) {',
  availableOrdersFunc + '\n  async getMyAssignments(delivererId: number) {',
);
fs.writeFileSync('src/deliverer/deliverer.service.ts', updated);
