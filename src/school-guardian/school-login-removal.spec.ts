import { removeMintedLogin } from './school-login-removal';
import { User } from '../users/entities/user.entity';

/** A manager whose transaction commits only when the callback resolves. */
function fakeManager(user: any, { userDeleteFails = false } = {}) {
  const committed = {
    rowsDropped: 0,
    user: { ...user },
    userGone: false,
  };
  const manager: any = {
    transaction: async (fn: (em: any) => Promise<any>) => {
      const draft = {
        rowsDropped: 0,
        user: { ...committed.user },
        userGone: false,
      };
      const em = {
        getRepository: (entity: unknown) =>
          entity === User
            ? {
                findOne: async () => (draft.userGone ? null : draft.user),
                remove: async () => {
                  if (userDeleteFails) throw new Error('FK violation');
                  draft.userGone = true;
                },
                save: async (u: any) => {
                  draft.user = { ...u };
                },
              }
            : {},
      };
      const out = await fn(em);
      committed.rowsDropped += 1;
      committed.user = draft.user;
      committed.userGone = draft.userGone;
      return out;
    },
  };
  return { manager, committed };
}

describe('removeMintedLogin', () => {
  const minted = {
    id: 5,
    authMode: 'MANUAL',
    posUsername: 'sm-1042',
    email: 'pos.s.sm-1042@sys.internal',
    isActive: true,
  };

  it('drops the rows and the user in one go', async () => {
    const { manager, committed } = fakeManager(minted);
    const out = await removeMintedLogin(
      manager,
      5,
      async () => {},
      async () => false,
    );
    expect(out).toEqual({ userRemoved: true, userRetired: false });
    expect(committed.userGone).toBe(true);
  });

  it('retires a user row that cannot be deleted — sign-in off, the username free', async () => {
    const { manager, committed } = fakeManager(minted, {
      userDeleteFails: true,
    });
    const out = await removeMintedLogin(
      manager,
      5,
      async () => {},
      async () => false,
    );
    expect(out).toEqual({ userRemoved: false, userRetired: true });
    expect(committed.rowsDropped).toBe(1);
    expect(committed.user).toMatchObject({
      posUsername: null,
      isActive: false,
    });
    expect(committed.user.email).toMatch(/^retired-5-/);
  });

  it('leaves a user another school still holds, or one the office did not mint', async () => {
    const held = fakeManager(minted);
    expect(
      await removeMintedLogin(
        held.manager,
        5,
        async () => {},
        async () => true,
      ),
    ).toEqual({ userRemoved: false, userRetired: false });
    const own = fakeManager({ ...minted, authMode: 'GOOGLE' });
    expect(
      await removeMintedLogin(
        own.manager,
        5,
        async () => {},
        async () => false,
      ),
    ).toEqual({ userRemoved: false, userRetired: false });
    expect(own.committed.userGone).toBe(false);
  });
});
