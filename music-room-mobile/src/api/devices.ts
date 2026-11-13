import type { ApiClient } from './client';

export type Device = { id: string; model: string; platform: string; appVersion: string; createdAt?: string };
export type DelegationPerson = { id: string; name: string; username: string | null };
export type ControlDelegation = { id: string; deviceId: string; delegateUserId: string; grantedAt: string; revokedAt: string | null; delegate: DelegationPerson };
export type DelegatedDevice = Device & { delegationId: string; grantedAt: string; owner: DelegationPerson };
export const DEVICE_PAGE_SIZE = 20;

export async function devicePage(client: ApiClient, page: number): Promise<Device[]> {
  const data = await client.request<Device[]>(`/devices?page=${page}&limit=${DEVICE_PAGE_SIZE}`);
  if (!Array.isArray(data) || !data.every(d => d && typeof d.id === 'string' && typeof d.platform === 'string' && typeof d.model === 'string')) {
    throw new Error('Unable to read your devices.');
  }
  return data;
}

export async function detachDevice(client: ApiClient, id: string): Promise<void> {
  if (id === client.currentDeviceId) throw new Error('Use Log out in Profile to leave this device.');
  await client.request(`/devices/${encodeURIComponent(id)}`, 'DELETE');
}

export const listDelegations = (client: ApiClient, deviceId: string) =>
  client.request<ControlDelegation[]>(`/devices/${encodeURIComponent(deviceId)}/delegations`);
export const listDelegatedDevices = (client: ApiClient) =>
  client.request<DelegatedDevice[]>('/devices/delegations/received');
export const grantControl = (client: ApiClient, deviceId: string, delegateUserId: string) =>
  client.request<ControlDelegation>(`/devices/${encodeURIComponent(deviceId)}/delegations`, 'POST', { delegateUserId });
export const revokeControl = (client: ApiClient, deviceId: string, delegateUserId: string) =>
  client.request<{ deleted: boolean }>(`/devices/${encodeURIComponent(deviceId)}/delegations/${encodeURIComponent(delegateUserId)}`, 'DELETE');
