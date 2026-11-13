import Constants from 'expo-constants';

// "Rooms nearby" needs a Sonora development build: Expo Go has no background location or background task, and on
// Android loading expo-notifications fails there. In Expo Go, or in a build made before it, its code is never loaded,
// and the rest of the app works.
function load(): typeof import('./nearby') | null {
  if (Constants.executionEnvironment === 'storeClient') return null;
  try {
    return require('./nearby');
  } catch {
    return null; // a build without its native parts
  }
}

export const nearby = load();
