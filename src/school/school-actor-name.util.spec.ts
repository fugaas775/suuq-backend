import { actorNameFromEmail } from './school-actor-name.util';

describe('actorNameFromEmail', () => {
  it('keeps the username of a login made on the staff desk', () => {
    expect(actorNameFromEmail('pos.m.guuleed.shukri@sys.internal')).toBe(
      'guuleed.shukri',
    );
    expect(actorNameFromEmail('POS.G.0915333513@SYS.INTERNAL')).toBe(
      '0915333513',
    );
  });

  it('keeps only what stands before the @ of a real address', () => {
    expect(actorNameFromEmail('  someone@example.com ')).toBe('someone');
  });

  it('answers nothing for nothing, and leaves a plain name alone', () => {
    expect(actorNameFromEmail(null)).toBe('');
    expect(actorNameFromEmail('')).toBe('');
    expect(actorNameFromEmail('Suuq S')).toBe('Suuq S');
  });
});
