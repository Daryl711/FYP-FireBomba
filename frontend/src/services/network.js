import NetInfo from "@react-native-community/netinfo";

// isInternetReachable is null while NetInfo is still checking; treat
// "unknown" as online so a slow probe never blocks requests.
const isOnline = (state) =>
  state.isConnected !== false && state.isInternetReachable !== false;

// Calls listener(true|false) now and on every connectivity change, but only
// when the value actually flips. Returns an unsubscribe function.
export function subscribeToNetwork(listener) {
  let last = null;
  return NetInfo.addEventListener((state) => {
    const online = isOnline(state);
    if (online === last) return;
    last = online;
    listener(online);
  });
}
