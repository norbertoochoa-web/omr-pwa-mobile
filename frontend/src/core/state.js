const TOKEN_KEY = 'omr_jwt_token';
const USER_KEY = 'omr_user_data';

export function setAuthToken(token) {
  sessionStorage.setItem(TOKEN_KEY, token);
}

export function getAuthToken() {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function clearAuthToken() {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
}

export function setUserData(userData) {
  sessionStorage.setItem(USER_KEY, JSON.stringify(userData));
}

export function getUserData() {
  const data = sessionStorage.getItem(USER_KEY);
  return data ? JSON.parse(data) : null;
}

export function isAuthenticated() {
  const token = getAuthToken();
  if (!token) return false;

  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const now = Date.now() / 1000;
    return payload.exp > now;
  } catch {
    return false;
  }
}

export function isSubscriptionActive() {
  const user = getUserData();
  return user && user.subscription && user.subscription.status === 'ACTIVE';
}
