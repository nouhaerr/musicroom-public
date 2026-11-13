import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsUUID, ValidateIf } from 'class-validator';

export class ControlPlaybackDto {
  @ApiProperty({ format: 'uuid', description: 'A device owned by the playlist owner and shared with you' })
  @IsUUID()
  deviceId!: string;

  @ApiProperty({ enum: ['PLAY', 'STOP', 'NEXT'] })
  @IsIn(['PLAY', 'STOP', 'NEXT'])
  action!: 'PLAY' | 'STOP' | 'NEXT';

  @ApiPropertyOptional({ format: 'uuid', description: 'The playlist track to play, or the current track when action is NEXT' })
  @ValidateIf((dto: ControlPlaybackDto) => dto.action !== 'STOP')
  @IsUUID()
  playlistSongId?: string;
}
