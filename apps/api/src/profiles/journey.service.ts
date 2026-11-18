import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { JourneyEventKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { confidenceReports, JourneyKind, JourneyPoint } from './confidence';

@Injectable()
export class JourneyService {
  constructor(private readonly prisma: PrismaService) {}

  async record(userId: string, kind: JourneyKind, sourceId?: string, sessionId?: string) {
    const event = await this.prisma.journeyEvent.create({
      data: {
        userId,
        kind: kind as JourneyEventKind,
        sourceId: sourceId ?? null,
        sessionId: sessionId ?? randomUUID(),
      },
    });
    return {
      id: event.id,
      kind: event.kind,
      sourceId: event.sourceId,
      sessionId: event.sessionId,
      occurredAt: event.occurredAt,
    };
  }

  async confidence(userId: string) {
    const [events, addressCount] = await Promise.all([
      this.prisma.journeyEvent.findMany({ where: { userId }, orderBy: { occurredAt: 'asc' } }),
      this.prisma.address.count({ where: { userId } }),
    ]);
    const points: JourneyPoint[] = events.map((event) => ({
      kind: event.kind,
      sourceId: event.sourceId,
      sessionId: event.sessionId,
      occurredAt: event.occurredAt,
    }));
    const artworks = confidenceReports(points, addressCount > 0);
    return {
      artworks,
      summary: {
        worksConsidered: artworks.length,
        worksStillUncertain: artworks.filter((artwork) => artwork.startedUncertain && !artwork.becameConfident).length,
        worksBecameConfident: artworks.filter((artwork) => artwork.becameConfident).length,
      },
    };
  }
}
