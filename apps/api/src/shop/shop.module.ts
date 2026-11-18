import { Module } from '@nestjs/common';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthModule } from '../auth/auth.module';
import { JourneyService } from '../profiles/journey.service';
import { ShopController } from './shop.controller';
import { ShopService } from './shop.service';

@Module({
  imports: [AuthModule],
  controllers: [ShopController],
  providers: [ShopService, JourneyService, RolesGuard],
})
export class ShopModule {}