const RAW_API_URL = (process.env.EXPO_PUBLIC_API_URL || "").trim();
const API_BASE = RAW_API_URL.replace(/\/+$/, "");
const API_ROOT = API_BASE.endsWith("/api") ? API_BASE : `${API_BASE}/api`;
const SERVER_ROOT = API_BASE.endsWith("/api") ? API_BASE.slice(0, -4) : API_BASE;

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

export async function registerUser(fullName, email, password) {
  try {
    const response = await fetch(`${API_ROOT}/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fullName, email, password }),
    });
    return await safeParseResponse(response);
  } catch (error) {
    console.error(error);
    return { error: "Network error. Cannot connect to server." };
  }
}

export async function loginUser(email, password) {
  try {
    console.log(API_ROOT);
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

export async function getSensorReading() {
  try {
    const response = await fetch(`${SERVER_ROOT}/room-detail/get-latest-readings`, {
      method: "GET",
      headers: { "Content-Type": "application/json" }
    });

    return await safeParseResponse(response);
  } catch (error) {
    return { error: "Network error. Cannot connect to server." };
  }
}
