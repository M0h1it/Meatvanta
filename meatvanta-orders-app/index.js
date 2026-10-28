/**
 * @format
 */

import { AppRegistry } from 'react-native';
import notifee from '@notifee/react-native';
import App from './App';
import { name as appName } from './app.json';
import { registerBackgroundMessageHandler } from './src/notifications/fcm';
import { handleNotifeeEvent } from './src/notifications/handlers';

// These two MUST be registered here, before AppRegistry: they are what runs when a push arrives
// or "Acknowledge" is tapped while the app is closed or the phone is locked.
registerBackgroundMessageHandler();
notifee.onBackgroundEvent(handleNotifeeEvent);

AppRegistry.registerComponent(appName, () => App);
