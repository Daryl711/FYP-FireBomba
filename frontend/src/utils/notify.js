import { Alert, Platform } from 'react-native';

// react-native-web's Alert.alert() is a no-op (no native dialog to show),
// so errors on web silently vanish unless we fall back to window.alert.
export function notify(title, message) {
  if (Platform.OS === 'web') {
    window.alert(message ? `${title}\n\n${message}` : title);
    return;
  }
  Alert.alert(title, message);
}
