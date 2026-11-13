import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class CreateDelegationDto {
  @ApiProperty({ format: 'uuid', description: 'An existing friend who may control this device' })
  @IsUUID()
  delegateUserId!: string;
}
