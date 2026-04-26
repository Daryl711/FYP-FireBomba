import Constants from "expo-constants";



const API_URL = process.env.EXPO_PUBLIC_API_URL;

export async function registerUser(fullName, email, password) {
  try {
    const response = await fetch(`${API_URL}/api/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fullName, email, password }),
    });
    return await response.json();
  } catch (error) {
    console.error(error);
    return { error: "Network error. Cannot connect to server." };
  }
}

export async function loginUser(email, password) {
  try {
    const response = await fetch(`${API_URL}/api/login`, {

      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    return await response.json();
  } catch (error) {
    console.error(error);
    return { error: "Network error. Cannot connect to server." };
  }
}

export async function getSensorReading() {
  try {
    const response = await fetch(`${API_URL}/room-detail/get-latest-readings`, {
      method: "GET",
      headers: { "Content-Type": "application/json" }
    });

    return await response.json();
  } catch (error) {
    return { error: "Network error. Cannot connect to server." };
  }
}
