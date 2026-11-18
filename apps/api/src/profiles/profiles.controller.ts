import { Body, Controller, Get, HttpCode, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { RequestUser } from '../common/types';
import { JourneyService } from './journey.service';
import { createArtistSchema, journeyEventSchema, updateArtistSchema, updateCollectorSchema } from './profile.schemas';
import { ProfilesService } from './profiles.service';

@Controller('me')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProfilesController {
  constructor(
    private readonly profiles: ProfilesService,
    private readonly journey: JourneyService,
  ) {}

  @Get('collector')
  collector(@CurrentUser() user: RequestUser) {
    return this.profiles.collectorFor(user.id);
  }

  @Patch('collector')
  updateCollector(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(updateCollectorSchema)) body: {
      displayName?: string;
      city?: string | null;
      countryCode?: string | null;
    },
  ) {
    return this.profiles.updateCollector(user.id, body);
  }

  @Get('artist')
  artist(@CurrentUser() user: RequestUser) {
    return this.profiles.artistFor(user.id);
  }

  @Post('artist')
  @HttpCode(201)
  createArtist(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(createArtistSchema))
    body: { displayName: string; bio?: string; city?: string; countryCode?: string; website?: string },
  ) {
    return this.profiles.createArtist(user.id, body);
  }

  @Patch('artist')
  updateArtist(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(updateArtistSchema))
    body: { displayName?: string; bio?: string; city?: string; countryCode?: string; website?: string },
  ) {
    return this.profiles.updateArtist(user.id, body);
  }

  @Post('journey')
  @HttpCode(201)
  recordJourney(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(journeyEventSchema))
    body: { kind: Parameters<JourneyService['record']>[1]; sourceId?: string; sessionId?: string },
  ) {
    return this.journey.record(user.id, body.kind, body.sourceId, body.sessionId);
  }

  @Get('confidence')
  confidence(@CurrentUser() user: RequestUser) {
    return this.journey.confidence(user.id);
  }
}
