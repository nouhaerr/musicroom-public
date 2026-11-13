import { Injectable } from '@nestjs/common';
import { SubscribeDto } from './dto/subscribe.dto';

// The services that change data announce it here; the gateway listens and sends the new state
// to whoever watches. This service depends on nothing, so PartiesService can use it without an
// import cycle (the gateway itself needs PartiesService to read that state).
@Injectable()
export class RealtimeService {
  private listener?: (target: SubscribeDto) => void;
  private deviceRevokedListener?: (deviceId: string) => void;
  private controlChangedListener?: (change: ControlChangedEvent) => void;
  private playbackCommandListener?: (command: PlaybackCommand) => boolean;

  // Call these only after the change is committed: the state read next must already contain it
  partyChanged(partyId: string) {
    this.listener?.({ type: 'party', id: partyId });
  }

  playlistChanged(playlistId: string) {
    this.listener?.({ type: 'playlist', id: playlistId });
  }

  deviceRevoked(deviceId: string) {
    this.deviceRevokedListener?.(deviceId);
  }

  controlChanged(change: ControlChangedEvent) {
    this.controlChangedListener?.(change);
  }

  sendPlaybackCommand(command: PlaybackCommand) {
    return this.playbackCommandListener?.(command) ?? false;
  }

  // The gateway registers itself here when it starts
  listen(listener: (target: SubscribeDto) => void) {
    this.listener = listener;
  }

  listenForDeviceRevocation(listener: (deviceId: string) => void) {
    this.deviceRevokedListener = listener;
  }

  listenForControlChanges(listener: (change: ControlChangedEvent) => void) {
    this.controlChangedListener = listener;
  }

  listenForPlaybackCommands(listener: (command: PlaybackCommand) => boolean) {
    this.playbackCommandListener = listener;
  }
}

export type ControlChangedEvent = {
  action: 'GRANTED' | 'REVOKED';
  deviceId: string;
  delegatorUserId: string;
  delegateUserId: string;
};

export type PlaybackCommand = {
  deviceId: string;
  playlistId: string;
  action: 'PLAY' | 'STOP';
  playlistSongId?: string;
  songId?: string;
  requestedByUserId: string;
};

export type PlaybackStatusReport = {
  playlistId: string;
  playlistSongId: string;
  state: 'PLAYING' | 'PAUSED' | 'STOPPED' | 'ENDED' | 'UNAVAILABLE';
  positionSeconds: number;
  durationSeconds: number;
};

export type PlaybackStatus = PlaybackStatusReport & {
  deviceId: string;
  updatedAt: number;
};
