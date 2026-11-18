import { useCallback, useRef, useState } from "react";
import { Alert } from "react-native";

// Pull-to-refresh state for a ScrollView's RefreshControl.
// `task` resolves to { ok: boolean } (or throws). When it fails, the user is
// told to check their connection; whatever was on screen stays there.
export default function usePullToRefresh(task, t) {
  const [refreshing, setRefreshing] = useState(false);
  const busy = useRef(false);

  const onRefresh = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setRefreshing(true);
    let ok = false;
    try {
      const result = await task();
      ok = result?.ok === true;
    } catch {
      ok = false;
    } finally {
      busy.current = false;
      setRefreshing(false);
    }
    if (!ok) {
      Alert.alert(t("common.refreshFailedTitle"), t("common.refreshFailedBody"));
    }
  }, [task, t]);

  return { refreshing, onRefresh };
}
