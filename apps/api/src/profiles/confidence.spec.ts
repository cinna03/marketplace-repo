import { JourneyPoint, scoreArtwork } from './confidence';

function point(kind: JourneyPoint['kind'], sessionId: string, at: string, sourceId = '436535'): JourneyPoint {
  return { kind, sourceId, sessionId, occurredAt: new Date(at) };
}

describe('scoreArtwork', () => {
  it('keeps a first look uncertain', () => {
    const report = scoreArtwork('436535', [point('artwork_viewed', 'session-a', '2026-11-17T10:00:00Z')], false);
    expect(report.score).toBe(15);
    expect(report.startedUncertain).toBe(true);
    expect(report.becameConfident).toBe(false);
    expect(report.gain).toBe(0);
  });

  it('marks confidence after a return visit, the room view, and a purchase', () => {
    const report = scoreArtwork(
      '436535',
      [
        point('artwork_viewed', 'session-a', '2026-11-17T10:00:00Z'),
        point('artwork_viewed', 'session-b', '2026-11-18T10:00:00Z'),
        point('dimensions_checked', 'session-b', '2026-11-18T10:05:00Z'),
        point('viewed_in_room', 'session-b', '2026-11-18T10:06:00Z'),
        point('purchase_completed', 'session-b', '2026-11-18T10:20:00Z'),
      ],
      true,
    );
    expect(report.becameConfident).toBe(true);
    expect(report.stage).toBe('purchased');
    expect(report.gain).toBeGreaterThan(0);
    expect(report.signals).toEqual(
      expect.arrayContaining(['first_view', 'returned', 'viewed_in_room', 'purchase_completed', 'address_saved']),
    );
  });

  it('drops the score when checkout is abandoned', () => {
    const stayed = scoreArtwork('436535', [point('artwork_viewed', 'session-a', '2026-11-17T10:00:00Z'), point('checkout_started', 'session-a', '2026-11-17T10:10:00Z')], false);
    const left = scoreArtwork(
      '436535',
      [
        point('artwork_viewed', 'session-a', '2026-11-17T10:00:00Z'),
        point('checkout_started', 'session-a', '2026-11-17T10:10:00Z'),
        point('checkout_abandoned', 'session-a', '2026-11-17T10:12:00Z'),
      ],
      false,
    );
    expect(left.score).toBe(stayed.score - 20);
  });
});
