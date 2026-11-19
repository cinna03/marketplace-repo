import { randomBytes } from 'crypto';
import { Injectable } from '@nestjs/common';
import { CatalogArtwork, ShopOrder, ShopOrderItem } from '@prisma/client';
import { ApiError } from '../common/errors';
import { FieldCipher } from '../common/crypto/field-cipher';
import { JourneyService } from '../profiles/journey.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ShopService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cipher: FieldCipher,
    private readonly journey: JourneyService,
  ) {}

  async cart(userId: string) {
    const cart = await this.prisma.cart.findUnique({
      where: { userId },
      include: { items: { include: { artwork: true }, orderBy: { id: 'asc' } } },
    });
    const items = (cart?.items ?? []).map((item) => this.presentItem(item.artwork, item.quantity, item.id));
    return {
      items,
      totalAmount: items.reduce((sum, item) => sum + BigInt(item.lineAmount), 0n).toString(),
      currency: items[0]?.currency ?? 'USD',
    };
  }

  async addItem(userId: string, sourceId: string, quantity: number) {
    const artwork = await this.artwork(sourceId);
    const cart = await this.prisma.cart.upsert({
      where: { userId },
      update: {},
      create: { userId },
    });
    await this.prisma.cartItem.upsert({
      where: { cartId_artworkId: { cartId: cart.id, artworkId: artwork.id } },
      update: { quantity },
      create: { cartId: cart.id, artworkId: artwork.id, quantity },
    });
    return this.cart(userId);
  }

  async updateItem(userId: string, itemId: string, quantity: number) {
    const item = await this.ownedItem(userId, itemId);
    await this.prisma.cartItem.update({ where: { id: item.id }, data: { quantity } });
    return this.cart(userId);
  }

  async removeItem(userId: string, itemId: string) {
    const item = await this.ownedItem(userId, itemId);
    await this.prisma.cartItem.delete({ where: { id: item.id } });
    return this.cart(userId);
  }

  async checkout(userId: string, addressId: string, sessionId?: string) {
    const owner = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!owner?.emailVerifiedAt) {
      throw new ApiError(403, 'EMAIL_UNCONFIRMED', 'Confirm the code sent to your email before placing an order.');
    }
    const address = await this.prisma.address.findFirst({ where: { id: addressId, userId } });
    if (!address) throw new ApiError(404, 'NOT_FOUND', 'Address not found.');
    const current = await this.prisma.cart.findUnique({
      where: { userId },
      include: { items: { include: { artwork: true } } },
    });
    if (!current?.items.length) throw new ApiError(400, 'CART_EMPTY', 'The cart is empty.');

    const currency = current.items[0].artwork.currency;
    const total = current.items.reduce((sum, item) => sum + item.artwork.priceAmount * BigInt(item.quantity), 0n);
    const order = await this.prisma.$transaction(async (tx) => {
      const created = await tx.shopOrder.create({
        data: {
          userId,
          number: orderNumber(),
          currency,
          totalAmount: total,
          recipientName: address.recipientName,
          line1Ciphertext: address.line1Ciphertext,
          line2Ciphertext: address.line2Ciphertext,
          city: address.city,
          region: address.region,
          postalCode: address.postalCode,
          countryCode: address.countryCode,
          items: {
            create: current.items.map((item) => ({
              sourceId: item.artwork.sourceId,
              title: item.artwork.title,
              artist: item.artwork.artist,
              quantity: item.quantity,
              unitAmount: item.artwork.priceAmount,
              widthCm: item.artwork.widthCm,
              heightCm: item.artwork.heightCm,
              depthCm: item.artwork.depthCm,
            })),
          },
        },
        include: { items: true },
      });
      await tx.cartItem.deleteMany({ where: { cartId: current.id } });
      return created;
    });

    for (const item of order.items) {
      await this.journey.record(userId, 'checkout_started', item.sourceId, sessionId);
    }
    return this.presentOrder(order);
  }

  async listOrders(userId: string) {
    const orders = await this.prisma.shopOrder.findMany({
      where: { userId },
      include: { items: true },
      orderBy: { placedAt: 'desc' },
    });
    return orders.map((order) => this.presentOrder(order));
  }

  async demoPay(userId: string, number: string, outcome: 'paid' | 'insufficient_funds' | 'timeout', sessionId?: string) {
    const order = await this.prisma.shopOrder.findUnique({ where: { number } });
    if (!order || order.userId !== userId) throw new ApiError(404, 'NOT_FOUND', 'Order not found.');
    if (order.status !== 'awaiting_payment') {
      throw new ApiError(409, 'ORDER_NOT_PAYABLE', 'This order is no longer awaiting payment.');
    }
    if (outcome === 'timeout') {
      throw new ApiError(504, 'DEMO_TIMEOUT', 'The demo payment timed out. Nothing was charged. You can try again.');
    }
    if (outcome === 'insufficient_funds') {
      throw new ApiError(402, 'DEMO_DECLINED', 'The demo payment was declined for insufficient funds. Nothing was charged.');
    }
    return this.markPaid(userId, number, sessionId);
  }

  async pay(userId: string, number: string, sessionId?: string) {
    const order = await this.prisma.shopOrder.findUnique({ where: { number }, include: { items: true } });
    if (!order || order.userId !== userId) throw new ApiError(404, 'NOT_FOUND', 'Order not found.');
    if (order.status !== 'awaiting_payment') {
      throw new ApiError(409, 'ORDER_NOT_PAYABLE', 'This order is no longer awaiting payment.');
    }
    return this.markPaid(userId, number, sessionId);
  }

  private async markPaid(userId: string, number: string, sessionId?: string) {
    const order = await this.prisma.shopOrder.findUnique({ where: { number }, include: { items: true } });
    if (!order || order.userId !== userId) throw new ApiError(404, 'NOT_FOUND', 'Order not found.');
    const paid = await this.prisma.shopOrder.update({
      where: { id: order.id },
      data: { status: 'paid', paidAt: new Date() },
      include: { items: true },
    });
    for (const item of paid.items) {
      await this.journey.record(userId, 'purchase_completed', item.sourceId, sessionId);
    }
    return this.presentOrder(paid);
  }

  private async artwork(sourceId: string): Promise<CatalogArtwork> {
    const artwork = await this.prisma.catalogArtwork.findUnique({
      where: { source_sourceId: { source: 'met', sourceId } },
    });
    if (!artwork) throw new ApiError(404, 'NOT_FOUND', 'Artwork not found.');
    return artwork;
  }

  private async ownedItem(userId: string, itemId: string) {
    const item = await this.prisma.cartItem.findFirst({ where: { id: itemId, cart: { userId } } });
    if (!item) throw new ApiError(404, 'NOT_FOUND', 'Cart item not found.');
    return item;
  }

  private presentItem(artwork: CatalogArtwork, quantity: number, id: string) {
    const line = artwork.priceAmount * BigInt(quantity);
    return {
      id,
      sourceId: artwork.sourceId,
      title: artwork.title,
      artist: artwork.artist,
      quantity,
      unitAmount: artwork.priceAmount.toString(),
      lineAmount: line.toString(),
      currency: artwork.currency.trim(),
      widthCm: Number(artwork.widthCm),
      heightCm: Number(artwork.heightCm),
      depthCm: Number(artwork.depthCm),
      thumbnailUrl: artwork.thumbnailUrl,
    };
  }

  private presentOrder(order: ShopOrder & { items: ShopOrderItem[] }) {
    return {
      number: order.number,
      status: order.status,
      currency: order.currency.trim(),
      totalAmount: order.totalAmount.toString(),
      placedAt: order.placedAt,
      paidAt: order.paidAt,
      shipping: {
        recipientName: order.recipientName,
        line1: this.cipher.decrypt(order.line1Ciphertext),
        line2: order.line2Ciphertext ? this.cipher.decrypt(order.line2Ciphertext) : null,
        city: order.city,
        region: order.region,
        postalCode: order.postalCode,
        countryCode: order.countryCode.trim(),
      },
      items: order.items.map((item) => ({
        sourceId: item.sourceId,
        title: item.title,
        artist: item.artist,
        quantity: item.quantity,
        unitAmount: item.unitAmount.toString(),
        widthCm: Number(item.widthCm),
        heightCm: Number(item.heightCm),
        depthCm: Number(item.depthCm),
      })),
    };
  }
}

function orderNumber(): string {
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `M${day}${randomBytes(3).toString('hex').toUpperCase()}`;
}
