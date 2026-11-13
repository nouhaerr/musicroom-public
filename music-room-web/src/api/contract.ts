// What the rooms and playlists pages need from the web API client (the same names as the mobile ApiClient). The shared
// client (client.ts) gives all of it, and every refusal is its ApiError, so that the pages can tell a 404 or a 409 from
// the rest.

export { ApiError } from './client';

export interface User {
  id: string;
  name: string;
}

export interface ApiClient {
  readonly baseUrl: string; // the server address
  readonly user: User | null; // who is signed in, or null
  // A JSON request with the signed-in user's token; the token is renewed once if the server refuses it (401)
  request<T>(path: string, method?: string, body?: unknown): Promise<T>;
  // Called at every login and logout; gives back the function that stops listening
  subscribe(listener: (user: User | null) => void): () => void;
  // The token for the live connection; given the token the server just refused, it renews it first
  socketAuth(refusedToken?: string): Promise<{ token: string; deviceId: string | null }>;
}
