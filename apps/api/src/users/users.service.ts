import { AddressInput, UpdateAddressInput, UpdateMeInput } from '@marketplace/contracts';
import { Injectable } from '@nestjs/common';
import { Address, Prisma } from '@prisma/client';
import { ApiError } from '../common/errors';
import { FieldCipher } from '../common/crypto/field-cipher';
import { JourneyService } from '../profiles/journey.service';
import { PrismaService } from '../prisma/prisma.service';

const accountInclude = {
  roles: { include: { role: true } },
  addresses: true,
  oauthAccounts: true,
  privacyRequests: true,
  mfaFactors: true,
} satisfies Prisma.UserInclude;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cipher: FieldCipher,
    private readonly journey: JourneyService,
  ) {}

  async getMe(userId: string) {
    const account = await this.exportAccount(userId);
    return account.user;
  }

  async updateMe(userId: string, input: UpdateMeInput) {
    if (input.phone !== undefined) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { phoneCiphertext: input.phone === null ? null : this.cipher.encrypt(input.phone) },
      });
    }
    return this.getMe(userId);
  }

  async exportAccount(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, include: accountInclude });
    if (!user) throw new ApiError(404, 'NOT_FOUND', 'Account not found.');

    return {
      user: {
        id: user.id,
        email: user.email,
        phone: user.phoneCiphertext ? this.cipher.decrypt(user.phoneCiphertext) : null,
        emailVerifiedAt: user.emailVerifiedAt,
        status: user.status,
        roles: user.roles.map((entry) => entry.role.name),
        mfaEnabled: user.mfaFactors.some((factor) => factor.confirmedAt && !factor.disabledAt),
        createdAt: user.createdAt,
      },
      addresses: user.addresses.map((address) => this.presentAddress(address)),
      oauthProviders: user.oauthAccounts.map((account) => account.provider),
      privacyRequests: user.privacyRequests.map((request) => ({
        id: request.id,
        type: request.type,
        status: request.status,
        createdAt: request.createdAt,
        completedAt: request.completedAt,
      })),
    };
  }

  async requestDeletion(userId: string, ip?: string) {
    const existing = await this.prisma.privacyRequest.findFirst({
      where: { userId, type: 'delete', status: 'pending' },
    });
    const current = await this.prisma.user.findUnique({ where: { id: userId } });
    if (current?.status === 'pending_deletion' && existing) {
      return { id: existing.id, status: existing.status };
    }

    return this.prisma.$transaction(async (tx) => {
      const request = await tx.privacyRequest.create({
        data: { userId, type: 'delete' },
      });
      await tx.user.update({
        where: { id: userId },
        data: { status: 'pending_deletion', tokenVersion: { increment: 1 } },
      });
      await tx.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: 'privacy.deletion_requested',
          entityType: 'user',
          entityId: userId,
          ip,
        },
      });
      return { id: request.id, status: request.status };
    });
  }

  listAddresses(userId: string) {
    return this.prisma.address.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }).then((rows) =>
      rows.map((address) => this.presentAddress(address)),
    );
  }

  async createAddress(userId: string, input: AddressInput) {
    return this.prisma.$transaction(async (tx) => {
      if (input.isDefaultShipping) {
        await tx.address.updateMany({ where: { userId }, data: { isDefaultShipping: false } });
      }
      const created = await tx.address.create({ data: this.addressData(userId, input) });
      await tx.journeyEvent.create({
        data: { userId, kind: 'address_saved', sessionId: 'server' },
      });
      return this.presentAddress(created);
    });
  }

  async updateAddress(userId: string, addressId: string, input: UpdateAddressInput) {
    const current = await this.ownedAddress(userId, addressId);
    return this.prisma.$transaction(async (tx) => {
      if (input.isDefaultShipping) {
        await tx.address.updateMany({ where: { userId }, data: { isDefaultShipping: false } });
      }
      const updated = await tx.address.update({
        where: { id: current.id },
        data: {
          label: input.label ?? current.label,
          recipientName: input.recipientName ?? current.recipientName,
          line1Ciphertext: input.line1 ? this.cipher.encrypt(input.line1) : current.line1Ciphertext,
          line2Ciphertext:
            input.line2 === undefined ? current.line2Ciphertext : input.line2 ? this.cipher.encrypt(input.line2) : null,
          city: input.city ?? current.city,
          region: input.region === undefined ? current.region : input.region,
          postalCode: input.postalCode ?? current.postalCode,
          countryCode: input.countryCode ?? current.countryCode,
          phoneCiphertext:
            input.phone === undefined ? current.phoneCiphertext : input.phone ? this.cipher.encrypt(input.phone) : null,
          isDefaultShipping: input.isDefaultShipping ?? current.isDefaultShipping,
        },
      });
      return this.presentAddress(updated);
    });
  }

  async deleteAddress(userId: string, addressId: string) {
    const removed = await this.prisma.address.deleteMany({ where: { id: addressId, userId } });
    if (removed.count !== 1) throw new ApiError(404, 'NOT_FOUND', 'Address not found.');
  }

  private async ownedAddress(userId: string, addressId: string) {
    const address = await this.prisma.address.findFirst({ where: { id: addressId, userId } });
    if (!address) throw new ApiError(404, 'NOT_FOUND', 'Address not found.');
    return address;
  }

  private addressData(userId: string, input: AddressInput): Prisma.AddressUncheckedCreateInput {
    return {
      userId,
      label: input.label,
      recipientName: input.recipientName,
      line1Ciphertext: this.cipher.encrypt(input.line1),
      line2Ciphertext: input.line2 ? this.cipher.encrypt(input.line2) : null,
      city: input.city,
      region: input.region,
      postalCode: input.postalCode,
      countryCode: input.countryCode,
      phoneCiphertext: input.phone ? this.cipher.encrypt(input.phone) : null,
      isDefaultShipping: input.isDefaultShipping ?? false,
    };
  }

  private presentAddress(address: Address) {
    return {
      id: address.id,
      label: address.label,
      recipientName: address.recipientName,
      line1: this.cipher.decrypt(address.line1Ciphertext),
      line2: address.line2Ciphertext ? this.cipher.decrypt(address.line2Ciphertext) : null,
      city: address.city,
      region: address.region,
      postalCode: address.postalCode,
      countryCode: address.countryCode.trim(),
      phone: address.phoneCiphertext ? this.cipher.decrypt(address.phoneCiphertext) : null,
      isDefaultShipping: address.isDefaultShipping,
    };
  }
}
