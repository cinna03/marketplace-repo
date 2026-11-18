import { priceCentsFor } from './area-pricing';

describe('priceCentsFor', () => {
  it('prices a 60 by 80 cm painting at 340 USD', () => {
    expect(priceCentsFor(60, 80)).toBe(34_000n);
  });
});
