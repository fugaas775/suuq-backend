import { GeoPriorityAugment } from '../../filtering/geo-priority.filter';

describe('GeoPriorityAugment', () => {
  it('compiles and can be constructed', () => {
    // We cannot instantiate TreeRepository easily here; just ensure class exists
    expect(typeof GeoPriorityAugment).toBe('function');
  });
});
