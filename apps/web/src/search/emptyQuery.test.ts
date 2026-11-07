import { describe, expect, it } from 'vitest';
import { isEmptyQuery } from './emptyQuery';

describe('isEmptyQuery', () => {
  it('counts nothing and spaces as empty', () => {
    expect(isEmptyQuery('')).toBe(true);
    expect(isEmptyQuery('   ')).toBe(true);
  });

  it('counts any letter as a query', () => {
    expect(isEmptyQuery('m')).toBe(false);
    expect(isEmptyQuery(' maito ')).toBe(false);
  });
});
