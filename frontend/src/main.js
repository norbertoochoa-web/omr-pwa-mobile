import './style.css';
import { isAuthenticated, getAuthToken } from './core/state.js';

const app = document.getElementById('app');

async function init() {
  if (isAuthenticated() && getAuthToken()) {
    const { showCameraScreen } = await import('./screens/Camera.js');
    showCameraScreen(app);
  } else {
    const { showLoginScreen } = await import('./screens/Login.js');
    showLoginScreen(app);
  }
}

init();
