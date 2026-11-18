import { randomBytes } from 'crypto';
import { Injectable } from '@nestjs/common';
import { ArtistProfile, CollectorProfile } from '@prisma/client';
import { isUniqueViolation, ApiError } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import { displayNameFromEmail, slugify } from './display-name';

type CollectorInput = {
  displayName?: string;
  city?: string | null;
  countryCode?: string | null;
};

type ArtistInput = {
  displayName?: string;
  bio?: string;
  city?: string;
  countryCode?: string;
  website?: string;
};

@Injectable()
export class ProfilesService {
  constructor(private readonly prisma: PrismaService) {}

  async collectorFor(userId: string) {
    const profile = await this.ensureCollector(userId);
    return presentCollector(profile);
  }

  async updateCollector(userId: string, input: CollectorInput) {
    await this.ensureCollector(userId);
    const complete = Boolean(input.displayName && input.displayName.length >= 2 && (input.city || input.countryCode));
    const profile = await this.prisma.collectorProfile.update({
      where: { userId },
      data: {
        displayName: input.displayName,
        city: input.city === undefined ? undefined : input.city,
        countryCode: input.countryCode === undefined ? undefined : input.countryCode,
        completedAt: complete ? new Date() : undefined,
      },
    });
    return presentCollector(profile);
  }

  async artistFor(userId: string) {
    const profile = await this.prisma.artistProfile.findUnique({ where: { userId } });
    if (!profile) throw new ApiError(404, 'NOT_FOUND', 'Artist profile not found.');
    return presentArtist(profile);
  }

  async createArtist(userId: string, input: Required<Pick<ArtistInput, 'displayName'>> & ArtistInput) {
    const existing = await this.prisma.artistProfile.findUnique({ where: { userId } });
    if (existing) throw new ApiError(409, 'ARTIST_PROFILE_EXISTS', 'This account already has an artist profile.');

    const profile = await this.prisma.$transaction(async (tx) => {
      const role = await tx.role.upsert({
        where: { name: 'artist' },
        update: {},
        create: { name: 'artist' },
      });
      await tx.userRole.upsert({
        where: { userId_roleId: { userId, roleId: role.id } },
        update: {},
        create: { userId, roleId: role.id },
      });
      return tx.artistProfile.create({
        data: {
          userId,
          displayName: input.displayName,
          slug: await this.uniqueSlug(tx, slugify(input.displayName)),
          bio: input.bio,
          city: input.city,
          countryCode: input.countryCode,
          website: input.website,
        },
      });
    });
    return presentArtist(profile);
  }

  async updateArtist(userId: string, input: ArtistInput) {
    const current = await this.prisma.artistProfile.findUnique({ where: { userId } });
    if (!current) throw new ApiError(404, 'NOT_FOUND', 'Artist profile not found.');
    const profile = await this.prisma.artistProfile.update({
      where: { userId },
      data: {
        displayName: input.displayName,
        slug: input.displayName ? await this.uniqueSlug(this.prisma, slugify(input.displayName), current.id) : undefined,
        bio: input.bio,
        city: input.city,
        countryCode: input.countryCode,
        website: input.website,
      },
    });
    return presentArtist(profile);
  }

  async ensureCollector(userId: string): Promise<CollectorProfile> {
    const existing = await this.prisma.collectorProfile.findUnique({ where: { userId } });
    if (existing) return existing;
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new ApiError(404, 'NOT_FOUND', 'Account not found.');
    try {
      return await this.prisma.collectorProfile.create({
        data: { userId, displayName: displayNameFromEmail(user.email) },
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const created = await this.prisma.collectorProfile.findUnique({ where: { userId } });
      if (!created) throw error;
      return created;
    }
  }

  private async uniqueSlug(
    db: { artistProfile: PrismaSlugLookup },
    base: string,
    ignoreId?: string,
  ): Promise<string> {
    const taken = await db.artistProfile.findUnique({ where: { slug: base } });
    if (!taken || taken.id === ignoreId) return base;
    return `${base}-${randomBytes(2).toString('hex')}`;
  }
}

type PrismaSlugLookup = {
  findUnique(args: { where: { slug: string } }): Promise<{ id: string } | null>;
};

function presentCollector(profile: CollectorProfile) {
  return {
    displayName: profile.displayName,
    city: profile.city,
    countryCode: profile.countryCode?.trim() ?? null,
    completedAt: profile.completedAt,
  };
}

function presentArtist(profile: ArtistProfile) {
  return {
    displayName: profile.displayName,
    slug: profile.slug,
    bio: profile.bio,
    city: profile.city,
    countryCode: profile.countryCode?.trim() ?? null,
    website: profile.website,
  };
}
