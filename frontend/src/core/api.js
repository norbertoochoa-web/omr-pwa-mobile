function getBaseUrl() {
  const params = new URLSearchParams(window.location.search);
  const apiUrl = params.get('api_url');
  if (apiUrl) return apiUrl;

  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl) return envUrl;

  return `${window.location.protocol}//${window.location.hostname}:8000/api/v1`;
}

const BASE_URL = getBaseUrl();
console.log('API Base URL:', BASE_URL);

async function request(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const headers = {};

  if (options.body instanceof FormData) {
    options.headers = {};
  } else {
    headers['Content-Type'] = 'application/json';
  }

  const token = sessionStorage.getItem('omr_jwt_token');
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const config = {
    ...options,
    headers: {
      ...headers,
      ...options.headers,
    },
  };

  try {
    const response = await fetch(url, config);
    const data = await response.json();

    if (!response.ok) {
      throw {
        status: response.status,
        ...data,
      };
    }

    return data;
  } catch (error) {
    if (error.status) throw error;
    throw { status: 0, message: 'Network error', code: 'NETWORK_ERROR' };
  }
}

export async function login(email, password) {
  console.log('Attempting login to:', `${BASE_URL}/auth/login`);
  return request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function checkSubscription(userId) {
  return request(`/subscription/${userId}`);
}

export async function createSession(sessionId, userId) {
  return request('/sessions', {
    method: 'POST',
    body: JSON.stringify({ name: sessionId }),
  });
}

export async function uploadImage(formData) {
  return request('/upload', {
    method: 'POST',
    body: formData,
  });
}

export async function downloadSessionTxt(sessionId) {
  const url = `${BASE_URL}/sessions/${sessionId}/download`;
  const token = sessionStorage.getItem('omr_jwt_token');

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw { status: response.status, message: 'Download failed' };
  }

  const blob = await response.blob();
  return blob;
}
