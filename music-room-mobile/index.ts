import { registerRootComponent } from 'expo';
// First: the task of "rooms nearby", which the phone may start with the app closed
import './src/nearby/load';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
