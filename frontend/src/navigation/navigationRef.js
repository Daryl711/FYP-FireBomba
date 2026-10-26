// Shared ref to the app's NavigationContainer, so components rendered outside
// the navigator (like the tutorial overlay) can still move between screens.
import { createNavigationContainerRef } from "@react-navigation/native";

export const navigationRef = createNavigationContainerRef();

// True once the signed-in screens are mounted. Right after sign-up the
// container may still be showing the login stack for a moment.
const canReachMain = () =>
  navigationRef.isReady() &&
  (navigationRef.getRootState()?.routeNames ?? []).includes("Main");

// Navigate to a screen inside the signed-in tabs. If they are not mounted yet,
// waits for the next navigation state change and tries again.
export function navigateInMain(params) {
  if (canReachMain()) {
    navigationRef.navigate("Main", params);
    return () => {};
  }
  const unsubscribe = navigationRef.addListener("state", () => {
    if (!canReachMain()) return;
    unsubscribe();
    navigationRef.navigate("Main", params);
  });
  return unsubscribe;
}
