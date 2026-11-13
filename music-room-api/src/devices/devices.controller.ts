import { PaginationDto } from '../common/pagination.dto';
import { Body, Controller, Delete, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DevicesService } from './devices.service';
import { RegisterDeviceDto } from './dto/register-device.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PublicUser } from '../users/user.mapper';
import { DeletedResponse } from '../common/responses';
import { ControlDelegationResponse, DelegatedDeviceResponse, DeviceResponse } from './dto/device.responses';
import { CreateDelegationDto } from './dto/delegation.dto';

@ApiTags('devices')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('devices')
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  // À appeler une fois au démarrage de l'app mobile. Le `id` retourné doit
  // être renvoyé dans le header `X-Device-Id` sur les appels suivants pour
  // que les logs (V.6) et la délégation de contrôle puissent cibler cet
  // appareil précis.
  @ApiOperation({ summary: 'Register this phone: once, when the app starts' })
  @ApiCreatedResponse({ type: DeviceResponse })
  @Post()
  register(@CurrentUser() user: PublicUser, @Req() request: Request & { sessionId: string }, @Body() dto: RegisterDeviceDto): Promise<DeviceResponse> {
    return this.devicesService.register(user.id, request.sessionId, dto);
  }

  @ApiOperation({ summary: 'List the phones registered on your account' })
  @ApiOkResponse({ type: [DeviceResponse] })
  @Get()
  list(@CurrentUser() user: PublicUser, @Query() query: PaginationDto): Promise<DeviceResponse[]> {
    return this.devicesService.listForUser(user.id, query);
  }

  @ApiOperation({ summary: 'List devices your friends have delegated to you' })
  @ApiOkResponse({ type: [DelegatedDeviceResponse] })
  @Get('delegations/received')
  delegatedToMe(@CurrentUser() user: PublicUser): Promise<DelegatedDeviceResponse[]> {
    return this.devicesService.listDelegatedTo(user.id);
  }

  @ApiOperation({ summary: 'List active control delegations for a device you own' })
  @ApiOkResponse({ type: [ControlDelegationResponse] })
  @Get(':id/delegations')
  delegations(@CurrentUser() user: PublicUser, @Param('id') id: string): Promise<ControlDelegationResponse[]> {
    return this.devicesService.listDelegations(user.id, id);
  }

  @ApiOperation({ summary: 'Give a friend control of one of your devices' })
  @ApiCreatedResponse({ type: ControlDelegationResponse })
  @Post(':id/delegations')
  grant(@CurrentUser() user: PublicUser, @Param('id') id: string, @Body() dto: CreateDelegationDto): Promise<ControlDelegationResponse> {
    return this.devicesService.grantControl(user.id, id, dto.delegateUserId);
  }

  @ApiOperation({ summary: 'Revoke a friend’s control of one of your devices' })
  @ApiOkResponse({ type: DeletedResponse })
  @Delete(':id/delegations/:userId')
  revoke(@CurrentUser() user: PublicUser, @Param('id') id: string, @Param('userId') delegateUserId: string): Promise<DeletedResponse> {
    return this.devicesService.revokeControl(user.id, id, delegateUserId);
  }

  @ApiOperation({ summary: 'Remove a phone from your account' })
  @ApiOkResponse({ type: DeletedResponse })
  @Delete(':id')
  remove(@CurrentUser() user: PublicUser, @Param('id') id: string): Promise<DeletedResponse> {
    return this.devicesService.remove(user.id, id);
  }
}
