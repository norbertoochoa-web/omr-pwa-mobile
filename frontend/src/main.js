import './style.css';
import { isAuthenticated, getAuthToken, setAuthToken, setUserData } from './core/state.js';
import { exchangeSSOToken } from './core/api.js';

const app = document.getElementById('app');

async function init() {
  const params = new URLSearchParams(window.location.search);
  const ssoToken = params.get('sso_token');

  if (ssoToken && !isAuthenticated()) {
    try {
      const result = await exchangeSSOToken(ssoToken);
      setAuthToken(result.token);
      setUserData({ user_id: result.user_id });
      window.history.replaceState({}, document.title, window.location.pathname);
    } catch (e) {
      console.error('SSO login failed', e);
    }
  }

  if (isAuthenticated() && getAuthToken()) {
    const { showCameraScreen } = await import('./screens/Camera.js');
    showCameraScreen(app);
  } else {
    const { showLoginScreen } = await import('./screens/Login.js');
    showLoginScreen(app);
  }
}

init();
