import { Module } from '@nestjs/common';
import { FriendsController } from './friends.controller';
import { FriendsService } from './friends.service';
import { RealtimeCoreModule } from '../realtime/realtime-core.module';

@Module({ imports: [RealtimeCoreModule], controllers: [FriendsController], providers: [FriendsService] })
export class FriendsModule {}
