import { fetchJson, postJson } from '../utils';

import type { BunkerSignerData } from './storage';

export type BunkerConnection = {
  name: string;
  data: BunkerSignerData;
  createdAtMs: number;
};

type BunkerConnectionsResponse = {
  connections: BunkerConnection[];
};

type SaveBunkerConnectionResponse = {
  ok: true;
  connection: BunkerConnection;
};

export function listBunkerConnections(): Promise<BunkerConnection[]> {
  return fetchJson<BunkerConnectionsResponse>('/api/bunker/connections').then(
    (response) => response.connections,
  );
}

export function saveBunkerConnection(props: {
  name: string;
  data: BunkerSignerData;
}): Promise<BunkerConnection> {
  return postJson<SaveBunkerConnectionResponse>(
    '/api/bunker/connections',
    props,
  ).then((response) => response.connection);
}
