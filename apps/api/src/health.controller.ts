import { Controller, Get } from '@nestjs/common';

@Controller()
export class RootController {
  @Get()
  root() {
    return {
      name: 'marketplace-api',
      health: '/v1/health',
      auth: '/v1/auth',
    };
  }
}

@Controller('health')
export class HealthController {
  @Get()
  health() {
    return { status: 'ok' };
  }
}
