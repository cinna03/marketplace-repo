const BASE_CENTS = 15_000n;
const ROUND_TO_CENTS = 1_000n;

/** Same rule as the Unity AreaPricingRule: 150 USD plus 400 USD per square metre, rounded to 10 USD. */
export function priceCentsFor(widthCm: number, heightCm: number): bigint {
  const width = BigInt(Math.round(widthCm * 100));
  const height = BigInt(Math.round(heightCm * 100));
  const cents = BASE_CENTS + (width * height * 4n) / 10_000n;
  const steps = (cents + ROUND_TO_CENTS / 2n) / ROUND_TO_CENTS;
  return steps * ROUND_TO_CENTS;
}
