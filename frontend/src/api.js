import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Auto-detect LAN IP for Expo Go on physical device
const getAPIUrl = () => {
    const devHost = Constants.expoConfig?.hostUri?.split(':')[0];
    if (devHost && devHost !== 'localhost') {
        return `http://${devHost}:3000/api`;
    }
    return process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api';
};

const API_URL = getAPIUrl();
const TOKEN_KEY = 'fireguard_token';

// Token helpers
export async function saveToken(token) {
    await AsyncStorage.setItem(TOKEN_KEY, token);
}
export async function getToken() {
    return AsyncStorage.getItem(TOKEN_KEY);
}
export async function clearToken() {
    await AsyncStorage.removeItem(TOKEN_KEY);
}

// Generic fetch wrapper that attaches the JWT if we have one
async function apiFetch(path, options = {}) {
    const token = await getToken();
    const headers = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
    };
    try {
        const response = await fetch(`${API_URL}${path}`, { ...options, headers });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            return { error: data.error || `Request failed (${response.status})` };
        }
        return data;
    } catch (err) {
        return { error: 'Network error. Cannot connect to server.' };
    }
}

export async function registerUser(fullName, email, password) {
    return apiFetch('/signup', {
        method: 'POST',
        body: JSON.stringify({ fullName, email, password }),
    });
}

export async function loginUser(email, password) {
    const result = await apiFetch('/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
    });
    // Save token on success so future requests are authenticated
    if (result.token) {
        await saveToken(result.token);
    }
    return result;
}

export async function logoutUser() {
    await clearToken();
}

// Example: call protected /api/me endpoint
export async function fetchCurrentUser() {
    return apiFetch('/me', { method: 'GET' });
}
