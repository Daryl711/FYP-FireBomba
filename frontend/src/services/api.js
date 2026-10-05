import * as SecureStore from "expo-secure-store";
import EventSource from "react-native-sse";

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

export async function getSensorReading(roomId) {
  try {

    const response = await authFetch(
      `${API_ROOT}/room-detail/get-latest-readings?roomId=${roomId}`,
    );
    return await safeParseResponse(response);
  } catch (error) {
    console.error(error);
    return { error: "Network error. Cannot connect to server." };
  }
}

export async function subscribeToSensorReadings(roomId, onReading, onError) {
  const token = await getAccessToken();
  if (!token) {
    throw new Error("Sign in to receive live sensor readings.");
  }

  let eventSource;
  let closed = false;

  const connect = (accessToken) => {
    if (closed) return;

    eventSource = new EventSource(
      `${API_ROOT}/room-detail/sensor-readings/stream?roomId=${encodeURIComponent(roomId)}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        pollingInterval: 5000,
      },
    );

    eventSource.addEventListener("sensor-reading", (event) => {
      try {
        onReading(JSON.parse(event.data));
      } catch (error) {
        onError(error);
      }
    });
    eventSource.addEventListener("error", async (event) => {
      if (event.xhrStatus === 401 || event.xhrStatus === 403) {
        eventSource.close();
        const refreshedToken = await tryRefreshToken();
        if (refreshedToken && !closed) {
          connect(refreshedToken);
          return;
        }
      }

      onError(new Error(event.message || "Sensor stream connection failed."));
    });
  };

  connect(token);
  return () => {
    closed = true;
    eventSource?.close();
  };
}

export async function subscribeToSensorAggregates(
  roomId,
  onAggregate,
  onPrediction,
  onError,
) {
  const token = await getAccessToken();
  if (!token) {
    throw new Error("Sign in to receive live sensor aggregates.");
  }

  let eventSource;
  let closed = false;

  const connect = (accessToken) => {
    if (closed) return;

    eventSource = new EventSource(
      `${API_ROOT}/room-detail/sensor-aggregates/stream?roomId=${encodeURIComponent(roomId)}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        pollingInterval: 5000,
      },
    );

    eventSource.addEventListener("sensor-aggregate", (event) => {
      try {
        onAggregate(JSON.parse(event.data));
      } catch (error) {
        onError(error);
      }
    });
    eventSource.addEventListener("sensor-prediction", (event) => {
      try {
        onPrediction(JSON.parse(event.data));
      } catch (error) {
        onError(error);
      }
    });
    eventSource.addEventListener("error", async (event) => {
      if (event.xhrStatus === 401 || event.xhrStatus === 403) {
        eventSource.close();
        const refreshedToken = await tryRefreshToken();
        if (refreshedToken && !closed) {
          connect(refreshedToken);
          return;
        }
      }

      onError(new Error(event.message || "Sensor aggregate stream failed."));
    });
  };

  connect(token);
  return () => {
    closed = true;
    eventSource?.close();
  };
}

export async function getSensorAggregates(roomId, limit = 10) {
  try {
    const response = await authFetch(
      `${API_ROOT}/room-detail/sensor-aggregates?roomId=${roomId}&limit=${limit}`,
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

export async function getBilikData() {
  try {
    const response = await authFetch(`${API_ROOT}/home/bilik-data`);
    return await safeParseResponse(response);
  } catch (error) {
    console.error(error);
    return { error: "Network error. Cannot connect to server." };
  }
}

export async function getRoomsByBilik(bilikId) {
  try {
    const response = await authFetch(`${API_ROOT}/home/bilik/${bilikId}/rooms`);
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

export async function getPumpStatus(roomId) {
  try {
    const response = await authFetch(
      `${API_ROOT}/room-detail/get-water-pump-status?roomId=${roomId}`,
    );
    const data = await safeParseResponse(response);
    return data;
  } catch (error) {
    return { error: "Network error. Cannot connect to server." };
  }
}

export async function controlWaterPumpStatus(roomId, waterPumpStatus) {
  try {
    const response = await authFetch(
      `${API_ROOT}/room-detail/control-water-pump`,
      {
        method: "PUT",
        body: JSON.stringify({ roomId, waterPumpStatus }),
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
