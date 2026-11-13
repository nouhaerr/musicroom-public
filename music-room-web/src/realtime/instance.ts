import { client } from '../api/instance';
import { Live } from './live';

// The one live connection of the tab, opened with the login of the shared client and closed at its logout
export const live = new Live(client);
