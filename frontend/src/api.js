// frontend/src/api.js

// Since you are testing on the web browser, we use localhost
const API_URL = 'http://localhost:3000/api'; 

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