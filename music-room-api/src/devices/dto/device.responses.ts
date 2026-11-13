import { ApiProperty } from '@nestjs/swagger';
import { Platform } from '../../../generated/prisma';

// A phone registered on the account
export class DeviceResponse {
  @ApiProperty({ format: 'uuid', description: 'Send it in the X-Device-Id header of the next requests' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  userId!: string;

  @ApiProperty({ type: String, nullable: true, description: 'Id of the app installation on the phone' })
  installationId!: string | null;

  @ApiProperty({ enum: Platform })
  platform!: Platform;

  @ApiProperty({ example: 'Pixel 7' })
  model!: string;

  @ApiProperty({ example: '1.0.0' })
  appVersion!: string;

  @ApiProperty()
  createdAt!: Date;
}

export class DelegationPersonResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ type: String, nullable: true })
  username!: string | null;
}

export class ControlDelegationResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  deviceId!: string;

  @ApiProperty({ format: 'uuid' })
  delegateUserId!: string;

  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  revokedAt!: Date | null;

  @ApiProperty({ format: 'date-time' })
  grantedAt!: Date;

  @ApiProperty({ type: () => DelegationPersonResponse })
  delegate!: DelegationPersonResponse;
}

export class DelegatedDeviceResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  delegationId!: string;

  @ApiProperty()
  model!: string;

  @ApiProperty({ enum: Platform })
  platform!: Platform;

  @ApiProperty()
  appVersion!: string;

  @ApiProperty({ format: 'date-time' })
  grantedAt!: Date;

  @ApiProperty({ type: () => DelegationPersonResponse })
  owner!: DelegationPersonResponse;
}
