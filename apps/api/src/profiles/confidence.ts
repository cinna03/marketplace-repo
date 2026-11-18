export const JOURNEY_KINDS = [
  'artwork_viewed',
  'dimensions_checked',
  'credit_reviewed',
  'viewed_in_room',
  'address_saved',
  'checkout_started',
  'checkout_abandoned',
  'purchase_completed',
] as const;

export type JourneyKind = (typeof JOURNEY_KINDS)[number];

export type JourneyPoint = {
  kind: JourneyKind;
  sourceId: string | null;
  sessionId: string;
  occurredAt: Date;
};

export type ConfidenceStage = 'browsing' | 'considering' | 'reassuring' | 'ready' | 'purchased';

export type ConfidenceReport = {
  sourceId: string;
  score: number;
  startedUncertain: boolean;
  becameConfident: boolean;
  gain: number;
  stage: ConfidenceStage;
  signals: string[];
};

const ARTWORK_KINDS = new Set<JourneyKind>([
  'artwork_viewed',
  'dimensions_checked',
  'credit_reviewed',
  'viewed_in_room',
  'checkout_started',
  'checkout_abandoned',
  'purchase_completed',
]);

export function confidenceReports(events: JourneyPoint[], addressSaved: boolean): ConfidenceReport[] {
  const groups = new Map<string, JourneyPoint[]>();
  for (const event of events) {
    if (!event.sourceId || !ARTWORK_KINDS.has(event.kind)) continue;
    const list = groups.get(event.sourceId) ?? [];
    list.push(event);
    groups.set(event.sourceId, list);
  }
  return [...groups.entries()].map(([sourceId, points]) => scoreArtwork(sourceId, points, addressSaved));
}

export function scoreArtwork(sourceId: string, points: JourneyPoint[], addressSaved: boolean): ConfidenceReport {
  const ordered = [...points].sort((left, right) => left.occurredAt.getTime() - right.occurredAt.getTime());
  let score = 0;
  const signals: string[] = [];
  let seenView = false;
  const viewSessions = new Set<string>();
  let returned = false;
  let viewedInRoom = false;
  let purchased = false;

  for (const point of ordered) {
    if (point.kind === 'artwork_viewed') {
      if (!seenView) {
        score += 15;
        seenView = true;
        signals.push('first_view');
      } else if (!viewSessions.has(point.sessionId)) {
        score += 15;
        returned = true;
        signals.push('returned');
      }
      viewSessions.add(point.sessionId);
      continue;
    }
    if (point.kind === 'dimensions_checked') {
      score += 10;
      signals.push('dimensions_checked');
    } else if (point.kind === 'credit_reviewed') {
      score += 10;
      signals.push('credit_reviewed');
    } else if (point.kind === 'viewed_in_room') {
      score += 25;
      viewedInRoom = true;
      signals.push('viewed_in_room');
    } else if (point.kind === 'checkout_started') {
      score += 10;
      signals.push('checkout_started');
    } else if (point.kind === 'checkout_abandoned') {
      score -= 20;
      signals.push('checkout_abandoned');
    } else if (point.kind === 'purchase_completed') {
      score += 20;
      purchased = true;
      signals.push('purchase_completed');
    }
  }

  if (addressSaved) {
    score += 10;
    signals.push('address_saved');
  }

  score = Math.max(0, Math.min(100, score));
  const becameConfident = seenView && (returned || viewedInRoom) && (purchased || score >= 70);
  let stage: ConfidenceStage = 'browsing';
  if (purchased) stage = 'purchased';
  else if (viewedInRoom) stage = 'reassuring';
  else if (returned) stage = 'considering';
  else if (score >= 40) stage = 'ready';

  return {
    sourceId,
    score,
    startedUncertain: seenView,
    becameConfident,
    gain: seenView ? Math.max(0, score - 15) : score,
    stage,
    signals: [...new Set(signals)],
  };
}
