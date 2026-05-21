import { login as apiLogin, checkSubscription } from '../core/api.js';
import { setAuthToken, setUserData, isAuthenticated } from '../core/state.js';

export function showLoginScreen(container) {
  container.innerHTML = `
    <div class="flex-1 flex flex-col items-center justify-center px-6 py-12">
      <div class="w-full max-w-sm">
        <div class="text-center mb-8">
          <h1 class="text-3xl font-bold text-white mb-2">OMR PWA</h1>
          <p class="text-gray-400 text-sm">Captura de cartillas de lectura</p>
        </div>

        <form id="login-form" class="space-y-4">
          <div>
            <label for="email" class="block text-sm font-medium text-gray-300 mb-1">Email</label>
            <input
              type="email"
              id="email"
              required
              class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="usuario@ejemplo.com"
              autocomplete="email"
            />
          </div>

          <div>
            <label for="password" class="block text-sm font-medium text-gray-300 mb-1">Contraseña</label>
            <input
              type="password"
              id="password"
              required
              class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="••••••••"
              autocomplete="current-password"
            />
          </div>

          <div id="login-error" class="hidden text-red-400 text-sm text-center"></div>

          <button
            type="submit"
            id="login-btn"
            class="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Iniciar Sesión
          </button>
        </form>

        <div class="mt-6 text-center">
          <p class="text-xs text-gray-500">Demo: admin@test.com / password123</p>
        </div>
      </div>
    </div>
  `;

  const form = document.getElementById('login-form');
  const errorDiv = document.getElementById('login-error');
  const loginBtn = document.getElementById('login-btn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    loginBtn.disabled = true;
    loginBtn.textContent = 'Verificando...';
    errorDiv.classList.add('hidden');

    try {
      const loginResponse = await apiLogin(email, password);

      setAuthToken(loginResponse.token);
      setUserData({
        user_id: loginResponse.user_id,
        email,
        subscription: loginResponse.subscription,
      });

      const subscription = await checkSubscription(loginResponse.user_id);

      if (subscription.status !== 'ACTIVE') {
        throw {
          message: 'Tu suscripción no está activa. Contacta a soporte para renovar.',
          code: 'SUBSCRIPTION_INACTIVE',
        };
      }

      setUserData({
        user_id: loginResponse.user_id,
        email,
        subscription,
      });

      const { showCameraScreen } = await import('./Camera.js');
      showCameraScreen(container);
    } catch (error) {
      errorDiv.textContent = error.message || 'Credenciales inválidas';
      errorDiv.classList.remove('hidden');
    } finally {
      loginBtn.disabled = false;
      loginBtn.textContent = 'Iniciar Sesión';
    }
  });
}
