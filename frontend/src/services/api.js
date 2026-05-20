import * as SecureStore from "expo-secure-store";

const RAW_API_URL = (process.env.EXPO_PUBLIC_API_URL || "").trim();
const API_BASE = RAW_API_URL.replace(/\/+$/, "");
const API_ROOT = API_BASE.endsWith("/api") ? API_BASE : `${API_BASE}/api`;

const ACCESS_TOKEN_KEY = "access_token";
const REFRESH_TOKEN_KEY = "refresh_token";

// ─── Token storage helpers ────────────────────────────────────────────────────

export const saveTokens = async (accessToken, refreshToken) => {
  await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken);
  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken);
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

// Attempt to get a new access token using the stored refresh token.
// Returns the new access token string, or null if refresh failed.
async function tryRefreshToken() {
  try {
    const refreshToken = await getRefreshToken();
    if (!refreshToken) return null;

    const response = await fetch(`${API_ROOT}/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) {
      await clearTokens();
      return null;
    }

    const data = await safeParseResponse(response);
    if (data.error) {
      await clearTokens();
      return null;
    }

    await saveTokens(data.accessToken, data.refreshToken);
    return data.accessToken;
  } catch {
    return null;
  }
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

export async function loginUser(email, password) {
  try {
    const response = await fetch(`${API_ROOT}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
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
    const response = await authFetch(`${API_ROOT}/room-detail/get-latest-readings`);
    return await safeParseResponse(response);
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

export async function getPumpStatus() {
  try {
    const response = await authFetch(`${API_ROOT}/room-detail/get-water-pump-status`);
    const data = await safeParseResponse(response);
    return data.waterPumpStatus;
  } catch (error) {
    return { error: "Network error. Cannot connect to server." };
  }
}

export async function controlWaterPumpStatus(waterPumpStatus) {
  try {
    const response = await authFetch(`${API_ROOT}/room-detail/control-water-pump`, {
      method: "PUT",
      body: JSON.stringify({ waterPumpStatus }),
    });
    return await safeParseResponse(response);
  } catch (error) {
    return { error: "Network error. Cannot connect to server." };
  }
}
