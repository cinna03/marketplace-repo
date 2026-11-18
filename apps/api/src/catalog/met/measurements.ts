export type ElementMeasurements = {
  Height?: number;
  Width?: number;
  Depth?: number;
};

export type MetMeasurement = {
  elementName?: string | null;
  elementMeasurements?: ElementMeasurements | null;
};

const PREFERRED_NAMES = ['Overall', 'Canvas', 'Panel', 'Sheet', 'Image'];

export function selectPaintingSize(measurements: MetMeasurement[] | null | undefined): ElementMeasurements | null {
  if (!measurements?.length) return null;

  for (const preferred of PREFERRED_NAMES) {
    for (const measurement of measurements) {
      if (measurement.elementName?.toLowerCase() === preferred.toLowerCase() && hasSize(measurement)) {
        return measurement.elementMeasurements ?? null;
      }
    }
  }

  for (const measurement of measurements) {
    const describesFrame = measurement.elementName?.toLowerCase().includes('frame') ?? false;
    if (!describesFrame && hasSize(measurement)) return measurement.elementMeasurements ?? null;
  }

  return null;
}

function hasSize(measurement: MetMeasurement): boolean {
  const size = measurement.elementMeasurements;
  return !!size && (size.Height ?? 0) > 0 && (size.Width ?? 0) > 0;
}
