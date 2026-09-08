import * as SecureStore from "expo-secure-store";

const RAW_API_URL = (process.env.EXPO_PUBLIC_API_URL || "").trim();
const API_BASE = RAW_API_URL.replace(/\/+$/, "");
const API_ROOT = API_BASE.endsWith("/api") ? API_BASE : `${API_BASE}/api`;

const ACCESS_TOKEN_KEY = "access_token";
const REFRESH_TOKEN_KEY = "refresh_token";
const SESSION_EXPIRES_KEY = "session_expires_at";
const REMEMBER_ME_KEY = "remember_me";
const SESSION_USER_KEY = "session_user";
// Deliberately NOT cleared on logout - it's a device preference, not session
// state, so turning biometrics off survives signing out and back in.
const BIOMETRIC_ENABLED_KEY = "biometric_enabled";

// ─── Token storage helpers ────────────────────────────────────────────────────

// SecureStore.setItemAsync throws on a null/undefined value, so anything
// missing is removed instead of written.
const writeItem = async (key, value) => {
  if (value === null || value === undefined) {
    await SecureStore.deleteItemAsync(key);
    return;
  }
  await SecureStore.setItemAsync(key, String(value));
};

export const saveTokens = async (accessToken, refreshToken) => {
  await writeItem(ACCESS_TOKEN_KEY, accessToken);
  await writeItem(REFRESH_TOKEN_KEY, refreshToken);
};

export const getAccessToken = async () => {
  return await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
};

export const getRefreshToken = async () => {
  return await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
};

export const clearTokens = async () => {
  await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
  await SecureStore.deleteItemAsync(SESSION_EXPIRES_KEY);
  await SecureStore.deleteItemAsync(REMEMBER_ME_KEY);
  await SecureStore.deleteItemAsync(SESSION_USER_KEY);
};

// ─── Session helpers (biometric login) ───────────────────────────────────────

// Persists everything needed to decide, on the next cold start, whether to
// show the biometric unlock screen or send the user back to the password form.
export const saveSession = async ({
  accessToken,
  refreshToken,
  sessionExpiresAt,
  rememberMe,
  user,
}) => {
  await saveTokens(accessToken, refreshToken);
  await writeItem(SESSION_EXPIRES_KEY, sessionExpiresAt);
  await writeItem(REMEMBER_ME_KEY, rememberMe ? "true" : "false");
  await writeItem(SESSION_USER_KEY, user ? JSON.stringify(user) : null);
};

export const getStoredSession = async () => {
  try {
    const [refreshToken, accessToken, sessionExpiresAt, rememberMe, rawUser] =
      await Promise.all([
        SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
        SecureStore.getItemAsync(ACCESS_TOKEN_KEY),
        SecureStore.getItemAsync(SESSION_EXPIRES_KEY),
        SecureStore.getItemAsync(REMEMBER_ME_KEY),
        SecureStore.getItemAsync(SESSION_USER_KEY),
      ]);

    let user = null;
    if (rawUser) {
      try {
        user = JSON.parse(rawUser);
      } catch {
        user = null;
      }
    }

    return {
      accessToken,
      refreshToken,
      sessionExpiresAt,
      rememberMe: rememberMe === "true",
      user,
    };
  } catch {
    // SecureStore unavailable — behave as if nothing was stored.
    return {
      accessToken: null,
      refreshToken: null,
      sessionExpiresAt: null,
      rememberMe: false,
      user: null,
    };
  }
};

// The 30/7-day rule is enforced server-side on every refresh; this is the
// local fast path so an expired session skips the biometric prompt entirely
// even when the phone is offline.
export const isSessionExpired = (sessionExpiresAt) => {
  if (!sessionExpiresAt) return false;
  const deadline = new Date(sessionExpiresAt).getTime();
  if (Number.isNaN(deadline)) return false;
  return Date.now() > deadline;
};

export const getBiometricPreference = async () => {
  try {
    // Defaults to on: after a password login the app should ask for biometrics
    // next time unless the user has explicitly turned it off.
    return (await SecureStore.getItemAsync(BIOMETRIC_ENABLED_KEY)) !== "false";
  } catch {
    return true;
  }
};

export const setBiometricPreference = async (enabled) => {
  try {
    await SecureStore.setItemAsync(
      BIOMETRIC_ENABLED_KEY,
      enabled ? "true" : "false",
    );
  } catch {
    // Preference is best-effort; a write failure just means the default stands.
  }
};

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function safeParseResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  const bodyText = await response.text();

  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(bodyText);
    } catch (_error) {
      return { error: "Invalid JSON response from server." };
    }
  }

  return {
    error: `Expected JSON but got ${contentType || "unknown content type"}.`,
    raw: bodyText.slice(0, 200),
  };
}

// AppContext registers a callback here so an expired session drops the user
// back to the login screen even while the app is already open.
let sessionExpiredHandler = null;

export const setOnSessionExpired = (handler) => {
  sessionExpiredHandler = handler;
};

// Exchanges the stored refresh token for a fresh pair. Used both by the
// biometric unlock screen and by authFetch's silent retry.
export async function refreshSession() {
  let refreshToken;
  try {
    refreshToken = await getRefreshToken();
  } catch {
    return { ok: false, reason: "NO_SESSION" };
  }

  if (!refreshToken) return { ok: false, reason: "NO_SESSION" };

  let response;
  let data;
  try {
    response = await fetch(`${API_ROOT}/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    data = await safeParseResponse(response);
  } catch {
    // Offline or server down. The session may still be perfectly valid, so
    // keep it stored and let the caller retry rather than forcing a logout.
    return { ok: false, reason: "NETWORK" };
  }

  if (!response.ok || data.error) {
    // A 403 means the server rejected the token outright - expired session or
    // one that has already been rotated away. Either way it is dead.
    if (response.status === 403) {
      await clearTokens();
      const reason = data.code || "REFRESH_FAILED";
      if (sessionExpiredHandler) sessionExpiredHandler(reason);
      return { ok: false, reason };
    }
    return { ok: false, reason: data.code || "REFRESH_FAILED" };
  }

  const stored = await getStoredSession();

  await saveSession({
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    sessionExpiresAt: data.sessionExpiresAt || stored.sessionExpiresAt,
    rememberMe: stored.rememberMe,
    user: data.user || stored.user,
  });

  return {
    ok: true,
    accessToken: data.accessToken,
    user: data.user || stored.user,
    sessionExpiresAt: data.sessionExpiresAt || stored.sessionExpiresAt,
  };
}

// Attempt to get a new access token using the stored refresh token.
// Returns the new access token string, or null if refresh failed.
async function tryRefreshToken() {
  const result = await refreshSession();
  return result.ok ? result.accessToken : null;
}

// Fetch wrapper that auto-refreshes the access token on 401
async function authFetch(url, options = {}) {
  let token = await getAccessToken();

  const makeRequest = (t) =>
    fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
        Authorization: `Bearer ${t}`,
      },
    });

  let response = await makeRequest(token);

  // Token expired — try to refresh silently
  if (response.status === 401) {
    const newToken = await tryRefreshToken();
    if (!newToken) return response; // refresh failed, let caller handle
    response = await makeRequest(newToken);
  }

  return response;
}

// ─── Auth endpoints ───────────────────────────────────────────────────────────

export async function registerUser(fullName, email, password) {
  try {
    const response = await fetch(`${API_ROOT}/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fullName, email, password }),
    });
    return await safeParseResponse(response);
  } catch (error) {
    return { error: "Network error. Cannot connect to server." };
  }
}

// rememberMe picks the session length the server hands back: 30 days when
// ticked, 7 when not.
export async function loginUser(email, password, rememberMe = false) {
  try {
    const response = await fetch(`${API_ROOT}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, rememberMe }),
    });
    return await safeParseResponse(response);
  } catch (error) {
    console.error(error);
    return { error: "Network error. Cannot connect to server." };
  }
}

export async function logoutUser(refreshToken) {
  try {
    await fetch(`${API_ROOT}/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    await clearTokens();
  } catch {
    await clearTokens();
  }
}

// ─── Protected endpoints (auto-refresh on 401) ───────────────────────────────

export async function getSensorReading() {
  try {
    const response = await authFetch(
      `${API_ROOT}/room-detail/get-latest-readings`,
    );
    return await safeParseResponse(response);
  } catch (error) {
    console.error(error);
    return { error: "Network error. Cannot connect to server." };
  }
}

export async function getSensorAggregates(limit = 10) {
  try {
    const response = await authFetch(
      `${API_ROOT}/room-detail/sensor-aggregates?limit=${limit}`,
    );
    const data = await safeParseResponse(response);
    return data.data || [];
  } catch (error) {
    console.error(error);
    return { error: "Network error. Cannot connect to server." };
  }
}

export async function getAlerts() {
  try {
    const response = await authFetch(`${API_ROOT}/alerts`);
    return await safeParseResponse(response);
  } catch (error) {
    return { error: "Network error. Cannot connect to server." };
  }
}

export async function getRoomData() {
  try {
    const response = await authFetch(`${API_ROOT}/home/room-data`);
    return await safeParseResponse(response);
  } catch (error) {
    console.error(error);
    return { error: "Network error. Cannot connect to server." };
  }
}

export async function markAlertRead(id) {
  try {
    const response = await authFetch(`${API_ROOT}/alerts/${id}/read`, {
      method: "PATCH",
    });
    return await safeParseResponse(response);
  } catch (error) {
    return { error: "Network error. Cannot connect to server." };
  }
}

export async function markAllAlertsRead() {
  try {
    const response = await authFetch(`${API_ROOT}/alerts/read-all`, {
      method: "PATCH",
    });
    return await safeParseResponse(response);
  } catch (error) {
    return { error: "Network error. Cannot connect to server." };
  }
}

export async function deleteAlert(id) {
  try {
    const response = await authFetch(`${API_ROOT}/alerts/${id}`, {
      method: "DELETE",
    });
    return await safeParseResponse(response);
  } catch (error) {
    return { error: "Network error. Cannot connect to server." };
  }
}

export async function hideAllAlerts() {
  try {
    const response = await authFetch(`${API_ROOT}/alerts/hide-all`, {
      method: "PATCH",
    });
    return await safeParseResponse(response);
  } catch (error) {
    return { error: "Network error. Cannot connect to server." };
  }
}

export async function getPumpStatus() {
  try {
    const response = await authFetch(
      `${API_ROOT}/room-detail/get-water-pump-status`,
    );
    const data = await safeParseResponse(response);
    return data.waterPumpStatus;
  } catch (error) {
    return { error: "Network error. Cannot connect to server." };
  }
}

export async function controlWaterPumpStatus(waterPumpStatus) {
  try {
    const response = await authFetch(
      `${API_ROOT}/room-detail/control-water-pump`,
      {
        method: "PUT",
        body: JSON.stringify({ waterPumpStatus }),
      },
    );
    return await safeParseResponse(response);
  } catch (error) {
    return { error: "Network error. Cannot connect to server." };
  }
}

export async function updateCameraStatus(cameraStatus) {
  try {
    const response = await authFetch(
      `${API_ROOT}/settings/update-camera-status`,
      {
        method: "PUT",
        body: JSON.stringify({ cameraStatus }),
      },
    );
    return await safeParseResponse(response);
  } catch (error) {
    return { error: "Network error. Cannot connect to server." };
  }
}

export async function getCameraStatus() {
  try {
    const response = await authFetch(`${API_ROOT}/settings/get-camera-status`, {
      method: "GET",
    });
    return await safeParseResponse(response);
  } catch (error) {
    return { error: "Network error. Cannot connect to server." };
  }
}
