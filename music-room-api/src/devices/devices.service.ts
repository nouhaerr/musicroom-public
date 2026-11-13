import { paginate, PaginationDto } from '../common/pagination.dto';
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Platform } from '../../generated/prisma';
import { RealtimeService } from '../realtime/realtime.service';
import { lockUsers } from '../common/locks';

@Injectable()
export class DevicesService {
  constructor(private readonly prisma: PrismaService, private readonly realtime: RealtimeService) {}

  // One registration per account and installation; legacy clients without an
  // installation UUID retain the original create behavior.
  register(userId: string, sessionId: string, data: { platform: Platform; model: string; appVersion: string; installationId?: string }) {
    return this.prisma.$transaction(async tx => {
      const device = data.installationId
        ? await tx.device.upsert({
          where: { userId_installationId: { userId, installationId: data.installationId } },
          create: { userId, ...data },
          update: { platform: data.platform, model: data.model, appVersion: data.appVersion },
        })
        : await tx.device.create({
          data: { userId, platform: data.platform, model: data.model, appVersion: data.appVersion },
        });
      await tx.authSession.updateMany({
        where: { id: sessionId, userId, revokedAt: null, OR: [{ deviceId: null }, { deviceId: device.id }] },
        data: { deviceId: device.id },
      });
      return device;
    });
  }

  findById(id: string) {
    return this.prisma.device.findUnique({ where: { id } });
  }

  listForUser(userId: string, query: PaginationDto) {
    return this.prisma.device.findMany({ where: { userId }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], ...paginate(query) });
  }

  listDelegations(userId: string, deviceId: string) {
    return this.prisma.$transaction(async tx => {
      const device = await tx.device.findFirst({ where: { id: deviceId, userId }, select: { id: true } });
      if (!device) throw new NotFoundException('Device not found');
      return tx.controlDelegation.findMany({
        where: { deviceId, delegatorUserId: userId, revokedAt: null },
        include: { delegate: { select: { id: true, name: true, username: true } } },
        orderBy: [{ grantedAt: 'desc' }, { id: 'asc' }],
      });
    });
  }

  async listDelegatedTo(userId: string) {
    const grants = await this.prisma.controlDelegation.findMany({
      where: { delegateUserId: userId, revokedAt: null, device: { userId: { not: userId } } },
      include: {
        device: { select: { id: true, model: true, platform: true, appVersion: true } },
        delegator: { select: { id: true, name: true, username: true } },
      },
      orderBy: [{ grantedAt: 'desc' }, { id: 'asc' }],
    });
    return grants.map(({ id, grantedAt, device, delegator }) => ({ ...device, delegationId: id, grantedAt, owner: delegator }));
  }

  async grantControl(userId: string, deviceId: string, delegateUserId: string) {
    if (userId === delegateUserId) throw new BadRequestException('You already control your own device');
    const result = await this.prisma.$transaction(async tx => {
      const devices = await tx.$queryRaw<{ id: string; userId: string }[]>`SELECT id, "userId" FROM "Device" WHERE id = ${deviceId} FOR UPDATE`;
      const device = devices[0];
      if (!device || device.userId !== userId) throw new NotFoundException('Device not found');
      await lockUsers(tx, [userId, delegateUserId]);
      const friend = await tx.user.findFirst({
        where: { id: userId, friends: { some: { id: delegateUserId } } },
        select: { id: true },
      });
      if (!friend) throw new ForbiddenException('Control can only be delegated to one of your friends');

      const active = await tx.controlDelegation.findFirst({
        where: { deviceId, delegatorUserId: userId, delegateUserId, revokedAt: null },
        include: { delegate: { select: { id: true, name: true, username: true } } },
      });
      if (active) return { delegation: active, changed: false };

      const previous = await tx.controlDelegation.findFirst({
        where: { deviceId, delegatorUserId: userId, delegateUserId },
        orderBy: [{ grantedAt: 'desc' }, { id: 'asc' }],
      });
      const delegation = previous
        ? await tx.controlDelegation.update({
          where: { id: previous.id }, data: { revokedAt: null, grantedAt: new Date() },
          include: { delegate: { select: { id: true, name: true, username: true } } },
        })
        : await tx.controlDelegation.create({
          data: { deviceId, delegatorUserId: userId, delegateUserId },
          include: { delegate: { select: { id: true, name: true, username: true } } },
        });
      return { delegation, changed: true };
    });
    if (result.changed) this.realtime.controlChanged({ action: 'GRANTED', deviceId, delegatorUserId: userId, delegateUserId });
    return result.delegation;
  }

  async revokeControl(userId: string, deviceId: string, delegateUserId: string) {
    const result = await this.prisma.$transaction(async tx => {
      const devices = await tx.$queryRaw<{ id: string; userId: string }[]>`SELECT id, "userId" FROM "Device" WHERE id = ${deviceId} FOR UPDATE`;
      const device = devices[0];
      if (!device || device.userId !== userId) throw new NotFoundException('Device not found');
      const revokedAt = new Date();
      const update = await tx.controlDelegation.updateMany({
        where: { deviceId, delegatorUserId: userId, delegateUserId, revokedAt: null }, data: { revokedAt },
      });
      if (!update.count) throw new NotFoundException('Active control delegation not found');
      return { deleted: true as const, revokedAt };
    });
    this.realtime.controlChanged({ action: 'REVOKED', deviceId, delegatorUserId: userId, delegateUserId });
    return { deleted: result.deleted };
  }

  async remove(userId: string, id: string) {
    const result = await this.prisma.$transaction(async tx => {
      const devices = await tx.$queryRaw<{ id: string; userId: string }[]>`SELECT id, "userId" FROM "Device" WHERE id = ${id} FOR UPDATE`;
      const device = devices[0];
      if (!device || device.userId !== userId) throw new NotFoundException('Device not found');
      const delegations = await tx.controlDelegation.findMany({
        where: { deviceId: device.id, revokedAt: null },
        select: { deviceId: true, delegatorUserId: true, delegateUserId: true },
      });
      await tx.authSession.updateMany({
        where: { userId, deviceId: device.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.device.delete({ where: { id: device.id } });
      return { deleted: true, delegations };
    });
    for (const delegation of result.delegations) this.realtime.controlChanged({ action: 'REVOKED', ...delegation });
    this.realtime.deviceRevoked(id);
    return { deleted: result.deleted };
  }
}
