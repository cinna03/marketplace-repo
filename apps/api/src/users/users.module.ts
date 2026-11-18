import { Module } from '@nestjs/common';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthModule } from '../auth/auth.module';
import { JourneyService } from '../profiles/journey.service';
import { ProfilesController } from '../profiles/profiles.controller';
import { ProfilesService } from '../profiles/profiles.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [AuthModule],
  controllers: [UsersController, ProfilesController],
  providers: [UsersService, ProfilesService, JourneyService, RolesGuard],
})
export class UsersModule {}
