import { UsersService } from './users.service';
import { User } from './entities/user.entity';
import { UserRole } from '../auth/roles.enum';
import { VerificationStatus } from './entities/user.entity';
import { FindUsersQueryDto } from './dto/find-users-query.dto';

// Lightweight in-memory query builder emulation to exercise UsersService.findAll filter logic
class FakeQueryBuilder<T extends User> {
  private data: T[];
  private predicates: Array<(u: T) => boolean> = [];
  private _skip = 0;
  private _take = Infinity;
  private _orderBy: keyof T = 'id';
  private _orderDir: 'ASC' | 'DESC' = 'DESC';
  private params: Record<string, any> = {};

  constructor(seed: T[]) {
    this.data = seed;
  }
  andWhere(sql: string, params?: Record<string, any>) {
    if (params) Object.assign(this.params, params);
    const p = this.buildPredicate(sql, params || {});
    this.predicates.push(p);
    return this;
  }
  orderBy(column: string, dir: 'ASC' | 'DESC') {
    this._orderBy = column.replace('user.', '') as keyof T;
    this._orderDir = dir;
    return this;
  }
  skip(n: number) {
    this._skip = n;
    return this;
  }
  take(n: number) {
    this._take = n;
    return this;
  }
  async getManyAndCount(): Promise<[T[], number]> {
    let rows = this.data.filter((u) => this.predicates.every((fn) => fn(u)));
    rows = rows.sort((a, b) => {
      const av = (a as any)[this._orderBy];
      const bv = (b as any)[this._orderBy];
      if (av === bv) return 0;
      if (this._orderDir === 'ASC') return av < bv ? -1 : 1;
      return av > bv ? -1 : 1;
    });
    const total = rows.length;
    rows = rows.slice(this._skip, this._skip + this._take);
    return [rows, total];
  }
  private buildPredicate(
    sql: string,
    params: Record<string, any>,
  ): (u: T) => boolean {
    // Handle patterns used in UsersService.findAll. Keep simple substring / equality semantics.
    sql = sql.trim();
    if (sql.startsWith('user.id =')) {
      const id = params.exactId;
      return (u) => u.id === id;
    }
    if (sql.includes('user.email ILIKE')) {
      const val = (params.emailLike || params.t || '')
        .replace(/%/g, '')
        .toLowerCase();
      return (u) => (u.email || '').toLowerCase().includes(val);
    }
    if (sql.includes('user.displayName ILIKE') && !sql.includes('OR')) {
      const val = (params.nameLike || params.t || '')
        .replace(/%/g, '')
        .toLowerCase();
      return (u) => (u.displayName || '').toLowerCase().includes(val);
    }
    if (sql.includes('user.storeName ILIKE') && !sql.includes('OR')) {
      const val = (params.storeLike || params.t || '')
        .replace(/%/g, '')
        .toLowerCase();
      return (u) => (u.storeName || '').toLowerCase().includes(val);
    }
    if (
      sql.includes('(user.email ILIKE') &&
      sql.includes('OR user.displayName ILIKE')
    ) {
      const val = (params.t || '').replace(/%/g, '').toLowerCase();
      return (u) =>
        (u.email || '').toLowerCase().includes(val) ||
        (u.displayName || '').toLowerCase().includes(val);
    }
    if (
      sql.includes('(user.displayName ILIKE') &&
      sql.includes('OR user.storeName ILIKE') &&
      sql.includes('OR user.email ILIKE')
    ) {
      const val = (params.t || '').replace(/%/g, '').toLowerCase();
      return (u) =>
        (u.displayName || '').toLowerCase().includes(val) ||
        (u.storeName || '').toLowerCase().includes(val) ||
        (u.email || '').toLowerCase().includes(val);
    }
    if (sql.startsWith('user.verificationStatus =')) {
      const vs = params.vs;
      return (u) => u.verificationStatus === vs;
    }
    if (sql.startsWith('user.isActive =')) {
      const ia = params.ia;
      return (u) => u.isActive === ia;
    }
    if (sql.startsWith('user.roles @>')) {
      const roles: UserRole[] = params.roles;
      return (u) => roles.every((r) => (u.roles || []).includes(r));
    }
    if (sql.startsWith('jsonb_array_length')) {
      if (sql.includes('> 0'))
        return (u) => (u.verificationDocuments || []).length > 0;
      if (sql.includes('= 0'))
        return (u) => (u.verificationDocuments || []).length === 0;
    }
    if (sql.includes('user."createdAt" >=')) {
      const from = new Date(params.from);
      return (u) => u.createdAt >= from;
    }
    if (sql.includes('user."createdAt" <=')) {
      const to = new Date(params.to);
      return (u) => u.createdAt <= to;
    }
    // Fallback pass-through (won't filter)
    return (_) => true;
  }
}

// Fake repository to supply our query builder to UsersService
class FakeUserRepository {
  constructor(private seed: User[]) {}
  createQueryBuilder() {
    return new FakeQueryBuilder<User>(this.seed);
  }
}

function makeUser(overrides: Partial<User>): User {
  return Object.assign(new User(), {
    id: overrides.id ?? Math.floor(Math.random() * 100000),
    email: overrides.email ?? 'user@example.com',
    roles: overrides.roles ?? [UserRole.CUSTOMER],
    displayName: overrides.displayName ?? 'User',
    storeName: overrides.storeName,
    isActive: overrides.isActive ?? true,
    verificationStatus:
      overrides.verificationStatus ?? VerificationStatus.UNVERIFIED,
    verificationDocuments: overrides.verificationDocuments ?? [],
    createdAt: overrides.createdAt ?? new Date('2025-01-01T00:00:00Z'),
  });
}

describe('UsersService.findAll filtering (in-memory integration)', () => {
  let service: UsersService;

  beforeEach(() => {
    const seed: User[] = [
      makeUser({
        id: 1,
        email: 'vendor1@example.com',
        roles: [UserRole.VENDOR],
        displayName: 'Vendor One',
        storeName: 'Electro World',
        isActive: true,
        verificationStatus: VerificationStatus.APPROVED,
        verificationDocuments: [{ url: 'x', name: 'doc' }],
      }),
      makeUser({
        id: 2,
        email: 'vendor2@example.com',
        roles: [UserRole.VENDOR],
        displayName: 'Vendor Two',
        storeName: 'Electro World 2',
        isActive: true,
        verificationStatus: VerificationStatus.APPROVED,
      }),
      makeUser({
        id: 3,
        email: 'cust1@example.com',
        roles: [UserRole.CUSTOMER],
        displayName: 'Customer One',
        isActive: false,
        verificationStatus: VerificationStatus.UNVERIFIED,
      }),
      makeUser({
        id: 4,
        email: 'cust2@example.com',
        roles: [UserRole.CUSTOMER],
        displayName: 'Customer Two',
        isActive: true,
        verificationStatus: VerificationStatus.APPROVED,
        verificationDocuments: [{ url: 'y', name: 'doc2' }],
      }),
      makeUser({
        id: 5,
        email: 'test@pending.io',
        roles: [UserRole.CUSTOMER],
        displayName: 'Pending User',
        isActive: true,
        verificationStatus: VerificationStatus.PENDING,
      }),
    ];
    const fakeRepo: any = new FakeUserRepository(seed);
    service = new UsersService(fakeRepo);
  });

  it('Active Vendor with Docs (active=1&role=VENDOR&hasdocs=true)', async () => {
    const filters: FindUsersQueryDto = {
      active: 1,
      role: UserRole.VENDOR,
      hasdocs: 'true',
      page: 1,
      pageSize: 50,
    } as any;
    const { users } = await service.findAll(filters);
    expect(users).toHaveLength(1);
    expect(users[0].email).toBe('vendor1@example.com');
  });

  it('Pending User by Email (verificationStatus=PENDING&email=test@)', async () => {
    const filters: FindUsersQueryDto = {
      verificationStatus: VerificationStatus.PENDING,
      email: 'test@',
      page: 1,
      pageSize: 50,
    } as any;
    const { users } = await service.findAll(filters);
    expect(users).toHaveLength(1);
    expect(users[0].email).toBe('test@pending.io');
  });

  it('Inactive Customers (active=0&role=CUSTOMER)', async () => {
    const filters: FindUsersQueryDto = {
      active: 0,
      role: UserRole.CUSTOMER,
      page: 1,
      pageSize: 50,
    } as any;
    const { users } = await service.findAll(filters);
    expect(users).toHaveLength(1);
    expect(users[0].email).toBe('cust1@example.com');
    expect(users[0].isActive).toBe(false);
  });
});
