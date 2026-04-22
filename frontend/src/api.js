import Constants from 'expo-constants';

// Auto-detect LAN IP for Expo Go on physical device
// Falls back to localhost for web/emulator
const getAPIUrl = () => {
  const devHost = Constants.expoConfig?.hostUri?.split(':')[0];
  
  if (devHost && devHost !== 'localhost') {
    // Physical device running Expo Go - use LAN IP
    return `http://${devHost}:3000/api`;
  }
  
  // Fallback localhost (web browser)
  return process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api';
};

const API_URL = getAPIUrl();

export async function registerUser(fullName, email, password) {
    try {
        const response = await fetch(`${API_URL}/signup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fullName, email, password }),
        });
        return await response.json();
    } catch (error) {
        return { error: 'Network error. Cannot connect to server.' };
    }
}

export async function loginUser(email, password) {
    try {
        const response = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });
        return await response.json();
    } catch (error) {
        return { error: 'Network error. Cannot connect to server.' };
    }
}