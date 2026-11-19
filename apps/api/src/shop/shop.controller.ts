import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { RequestUser } from '../common/types';
import { addCartItemSchema, checkoutSchema, demoPaySchema, updateCartItemSchema } from './shop.schemas';
import { ShopService } from './shop.service';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class ShopController {
  constructor(private readonly shop: ShopService) {}

  @Get('cart')
  cart(@CurrentUser() user: RequestUser) {
    return this.shop.cart(user.id);
  }

  @Post('cart/items')
  @HttpCode(201)
  addItem(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(addCartItemSchema)) body: { sourceId: string; quantity: number },
  ) {
    return this.shop.addItem(user.id, body.sourceId, body.quantity);
  }

  @Patch('cart/items/:id')
  updateItem(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateCartItemSchema)) body: { quantity: number },
  ) {
    return this.shop.updateItem(user.id, id, body.quantity);
  }

  @Delete('cart/items/:id')
  removeItem(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.shop.removeItem(user.id, id);
  }

  @Post('checkout')
  checkout(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(checkoutSchema)) body: { addressId: string; sessionId?: string },
  ) {
    return this.shop.checkout(user.id, body.addressId, body.sessionId);
  }

  @Get('orders')
  orders(@CurrentUser() user: RequestUser) {
    return this.shop.listOrders(user.id);
  }

  @Post('orders/:number/demo-pay')
  demoPay(
    @CurrentUser() user: RequestUser,
    @Param('number') number: string,
    @Body(new ZodValidationPipe(demoPaySchema)) body: { outcome: 'paid' | 'insufficient_funds' | 'timeout'; sessionId?: string },
  ) {
    return this.shop.demoPay(user.id, number, body.outcome, body.sessionId);
  }
}
