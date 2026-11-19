import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AddressInput, UpdateAddressInput, UpdateMeInput, addressSchema, librarySchema, updateAddressSchema, updateMeSchema } from '@marketplace/contracts';
import { Request } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { RequestUser } from '../common/types';
import { UsersService } from './users.service';

@Controller('me')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  getMe(@CurrentUser() user: RequestUser) {
    return this.users.getMe(user.id);
  }

  @Patch()
  updateMe(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(updateMeSchema)) body: UpdateMeInput,
  ) {
    return this.users.updateMe(user.id, body);
  }

  @Get('export')
  exportMe(@CurrentUser() user: RequestUser) {
    return this.users.exportAccount(user.id);
  }

  @Get('library')
  library(@CurrentUser() user: RequestUser) {
    return this.users.library(user.id);
  }

  @Put('library')
  replaceLibrary(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(librarySchema)) body: { saved: string[]; tries: { sourceId: string; at: string; outcome?: string; image?: string }[] },
  ) {
    return this.users.replaceLibrary(user.id, body.saved, body.tries);
  }

  @Post('deletion-requests')
  @HttpCode(202)
  requestDeletion(@CurrentUser() user: RequestUser, @Req() request: Request) {
    return this.users.requestDeletion(user.id, request.ip);
  }

  @Get('addresses')
  listAddresses(@CurrentUser() user: RequestUser) {
    return this.users.listAddresses(user.id);
  }

  @Post('addresses')
  createAddress(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(addressSchema)) body: AddressInput,
  ) {
    return this.users.createAddress(user.id, body);
  }

  @Patch('addresses/:id')
  updateAddress(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateAddressSchema)) body: UpdateAddressInput,
  ) {
    return this.users.updateAddress(user.id, id, body);
  }

  @Delete('addresses/:id')
  @HttpCode(204)
  deleteAddress(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.users.deleteAddress(user.id, id);
  }
}
