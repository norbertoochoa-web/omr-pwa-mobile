import { startCalibration, stopCalibration, resetCalibration } from '../core/camera.js';
import { addToQueue, getQueueStats, getPendingItems, updateStatus, incrementRetryCount } from '../core/db.js';
import { getUserData, clearAuthToken } from '../core/state.js';
import { createSession, downloadSessionTxt, uploadImage } from '../core/api.js';
import { showLoginScreen } from './Login.js';

let videoStream = null;
let currentSessionId = null;
let captureCount = 0;

export async function showCameraScreen(container) {
  const user = getUserData();
  if (!user) {
    showLoginScreen(container);
    return;
  }

  try {
    const result = await createSession(`Sesión ${new Date().toLocaleString()}`, user.user_id);
    currentSessionId = result.session_token;
  } catch {
    currentSessionId = crypto.randomUUID();
  }

  container.innerHTML = `
    <div class="flex flex-col h-full w-full bg-black relative overflow-hidden">
      <!-- Header -->
      <div class="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/80 to-transparent safe-area-top">
        <button id="logout-btn" class="p-3 rounded-xl bg-white/20 backdrop-blur-md active:bg-white/30 transition-colors">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
        </button>
        <div class="text-center">
          <p class="text-sm font-semibold text-white">Sesión: ${currentSessionId.slice(-8)}</p>
          <p id="capture-counter" class="text-xs text-gray-300 mt-1">0 capturas</p>
        </div>
        <button id="sync-btn" class="p-3 rounded-xl bg-white/20 backdrop-blur-md active:bg-white/30 transition-colors">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m0 0l4 4" />
          </svg>
        </button>
      </div>

      <!-- Camera View -->
      <div class="flex-1 relative overflow-hidden">
        <video id="camera-video" autoplay playsinline muted class="absolute inset-0 w-full h-full object-cover"></video>
        <canvas id="calibration-canvas" class="hidden"></canvas>

        <!-- Dark overlay outside capture area -->
        <div class="absolute inset-0 z-10 pointer-events-none">
          <div class="absolute inset-0 bg-black/40"></div>
          <div id="capture-area" class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" style="width: min(85vw, 340px); height: min(110vw, 440px);">
            <div class="absolute inset-0 bg-transparent border-4 border-overlay-red rounded-xl overlay-transition"></div>
            
            <!-- Corner markers for alignment -->
            <div class="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-white -mt-1 -ml-1"></div>
            <div class="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-white -mt-1 -mr-1"></div>
            <div class="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-white -mb-1 -ml-1"></div>
            <div class="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-white -mb-1 -mr-1"></div>
            
            <!-- Status indicator -->
            <div id="overlay-status" class="absolute -top-12 left-0 right-0 text-center">
              <span class="inline-flex items-center px-4 py-2 rounded-full text-sm font-semibold bg-red-500/90 text-white shadow-lg">
                <span class="w-2.5 h-2.5 bg-white rounded-full mr-2 animate-pulse"></span>
                Enfoca la cartilla
              </span>
            </div>
            
            <!-- Instructions -->
            <div class="absolute -bottom-16 left-0 right-0 text-center">
              <p class="text-xs text-gray-300 bg-black/50 px-3 py-1.5 rounded-full inline-block">
                Alinea las marcas + en las esquinas
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- Controls -->
      <div class="absolute bottom-0 left-0 right-0 z-20 pb-8 pt-12 bg-gradient-to-t from-black/80 to-transparent safe-area-bottom">
        <div class="flex items-center justify-center gap-8 px-6">
          <button id="download-btn" class="p-4 rounded-full bg-white/20 backdrop-blur-md disabled:opacity-30 disabled:cursor-not-allowed active:bg-white/30 transition-all" disabled>
            <svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </button>

          <button id="capture-btn" class="p-2 rounded-full bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95" disabled>
            <div class="w-16 h-16 rounded-full border-[6px] border-gray-900"></div>
          </button>

          <button id="queue-btn" class="p-4 rounded-full bg-white/20 backdrop-blur-md relative active:bg-white/30 transition-all">
            <svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
            <span id="queue-badge" class="hidden absolute -top-1 -right-1 min-w-[20px] h-5 bg-red-500 rounded-full text-[10px] font-bold flex items-center justify-center px-1">0</span>
          </button>
        </div>
      </div>

      <!-- Toast -->
      <div id="toast" class="hidden fixed top-24 left-1/2 -translate-x-1/2 px-5 py-2.5 rounded-xl bg-gray-900/95 text-white text-sm font-medium z-50 shadow-xl backdrop-blur-sm border border-gray-700"></div>
    </div>
  `;

  const video = document.getElementById('camera-video');
  const canvas = document.getElementById('calibration-canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const captureArea = document.getElementById('capture-area');
  const overlayBorder = captureArea.querySelector('.border-4');
  const overlayStatus = document.getElementById('overlay-status');
  const captureBtn = document.getElementById('capture-btn');
  const captureCounter = document.getElementById('capture-counter');
  const logoutBtn = document.getElementById('logout-btn');
  const syncBtn = document.getElementById('sync-btn');
  const downloadBtn = document.getElementById('download-btn');
  const queueBtn = document.getElementById('queue-btn');
  const queueBadge = document.getElementById('queue-badge');

  canvas.width = 320;
  canvas.height = 320;

  try {
    videoStream = await navigator.mediaDevices.getUserMedia({
      video: { 
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 }, 
        height: { ideal: 720 }
      },
      audio: false,
    });
    video.srcObject = videoStream;
    console.log('Camera stream started successfully');
  } catch (err) {
    console.error('Camera error:', err.name, err.message);
    showToast('Cámara no disponible: ' + err.message);
    
    const fallbackDiv = document.createElement('div');
    fallbackDiv.className = 'flex-1 flex items-center justify-center bg-gray-900';
    fallbackDiv.innerHTML = `
      <div class="text-center px-6">
        <svg class="w-16 h-16 mx-auto text-gray-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        <p class="text-gray-400 mb-2">Cámara no disponible</p>
        <p class="text-gray-500 text-sm mb-6">Error: ${err.message || 'Desconocido'}</p>
        <button id="fallback-capture-btn" class="px-8 py-4 bg-blue-600 rounded-xl text-white font-semibold text-lg active:bg-blue-700 transition-colors">
           Usar galería
        </button>
      </div>
    `;
    
    const videoContainer = document.querySelector('.flex-1.relative');
    if (videoContainer) {
      videoContainer.replaceWith(fallbackDiv);
    }
    
    document.getElementById('fallback-capture-btn').addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.capture = 'environment';
      input.onchange = (e) => handleFallbackCapture(e.target.files[0]);
      input.click();
    });
    return;
  }

  video.addEventListener('loadeddata', () => {
    console.log('Video loaded, starting calibration');
    startCalibration(video, canvas, ctx, (calibrated) => {
      if (calibrated) {
        overlayBorder.classList.remove('border-overlay-red');
        overlayBorder.classList.add('border-overlay-green');
        overlayStatus.innerHTML = `
          <span class="inline-flex items-center px-4 py-2 rounded-full text-sm font-semibold bg-green-500/90 text-white shadow-lg">
            <span class="w-2.5 h-2.5 bg-white rounded-full mr-2"></span>
            ¡Listo! Toca para capturar
          </span>
        `;
        captureBtn.disabled = false;
        captureBtn.classList.add('animate-pulse');
      } else {
        overlayBorder.classList.remove('border-overlay-green');
        overlayBorder.classList.add('border-overlay-red');
        overlayStatus.innerHTML = `
          <span class="inline-flex items-center px-4 py-2 rounded-full text-sm font-semibold bg-red-500/90 text-white shadow-lg">
            <span class="w-2.5 h-2.5 bg-white rounded-full mr-2 animate-pulse"></span>
            Enfoca la cartilla
          </span>
        `;
        captureBtn.disabled = true;
        captureBtn.classList.remove('animate-pulse');
      }
    });
  });

  video.addEventListener('error', (e) => {
    console.error('Video error:', e);
    showToast('Error al cargar la cámara');
  });

  captureBtn.addEventListener('click', async () => {
    captureBtn.disabled = true;

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = video.videoWidth;
    tempCanvas.height = video.videoHeight;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(video, 0, 0);

    const imageData = tempCanvas.toDataURL('image/jpeg', 0.85);

    try {
      await addToQueue(imageData, currentSessionId);
      captureCount++;
      captureCounter.textContent = `${captureCount} captura${captureCount !== 1 ? 's' : ''}`;
      downloadBtn.disabled = false;
      showToast('Procesando...');

      if (navigator.vibrate) navigator.vibrate(30);
    } catch {
      showToast('Error al guardar captura');
      captureBtn.disabled = false;
      resetCalibration();
      return;
    }

    await syncQueue();
    updateQueueBadge();

    const stats = await getQueueStats();
    if (stats.failed > 0) {
      showToast('Error al procesar imagen');
    } else {
      showToast(`Captura ${captureCount} procesada ✓`);
    }

    resetCalibration();
  });

  logoutBtn.addEventListener('click', async () => {
    stopCalibration();
    if (videoStream) {
      videoStream.getTracks().forEach((track) => track.stop());
    }
    clearAuthToken();
    captureCount = 0;
    currentSessionId = null;
    showLoginScreen(container);
  });

  syncBtn.addEventListener('click', async () => {
    showToast('Sincronizando...');
    await syncQueue();
    showToast('Sincronización completada');
    updateQueueBadge();
  });

  downloadBtn.addEventListener('click', async () => {
    if (!currentSessionId) return;
    
    const stats = await getQueueStats();
    if (stats.pending > 0 || stats.uploading > 0) {
      showToast('Sincronizando capturas...');
      await syncQueue();
      updateQueueBadge();
    }
    
    try {
      showToast('Generando archivo...');
      const blob = await downloadSessionTxt(currentSessionId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${currentSessionId}.txt`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Archivo descargado');
    } catch (err) {
      console.error('Download error:', err);
      showToast('Error al descargar');
    }
  });

  queueBtn.addEventListener('click', () => {
    updateQueueBadge();
    const stats = getQueueStats();
    showToast(`Cola: ${stats.pending} pendientes, ${stats.failed} fallidas`);
  });

  updateQueueBadge();

  window.addEventListener('online', async () => {
    showToast('Conexión restaurada - sincronizando');
    await syncQueue();
    updateQueueBadge();
  });
}

function handleFallbackCapture(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      await addToQueue(e.target.result, currentSessionId);
      captureCount++;
      document.getElementById('capture-counter').textContent = `${captureCount} captura${captureCount !== 1 ? 's' : ''}`;
      showToast('Imagen guardada');
    } catch {
      showToast('Error al guardar');
    }
  };
  reader.readAsDataURL(file);
}

async function syncQueue() {
  const pending = await getPendingItems();

  for (const item of pending) {
    if (item.retryCount >= 3) {
      await updateStatus(item.id, 'FAILED', 'Max retries exceeded');
      continue;
    }

    await updateStatus(item.id, 'UPLOADING');

    try {
      const formData = new FormData();

      const base64Data = item.imageData.split(',')[1];
      const byteCharacters = atob(base64Data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'image/jpeg' });

      formData.append('image', blob, `capture_${item.id}.jpg`);
      formData.append('session_id', item.sessionId);
      formData.append('timestamp', item.timestamp.toString());

      await uploadImage(formData);
      await updateStatus(item.id, 'SUCCESS');
    } catch {
      await incrementRetryCount(item.id);
      const delay = Math.pow(2, item.retryCount) * 1000;
      await new Promise((resolve) => setTimeout(resolve, delay));

      try {
        const formData = new FormData();
        const base64Data = item.imageData.split(',')[1];
        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'image/jpeg' });
        formData.append('image', blob, `capture_${item.id}.jpg`);
        formData.append('session_id', item.sessionId);
        formData.append('timestamp', item.timestamp.toString());
        await uploadImage(formData);
        await updateStatus(item.id, 'SUCCESS');
      } catch {
        await updateStatus(item.id, 'FAILED', 'Upload failed after retry');
      }
    }
  }
}

async function updateQueueBadge() {
  const stats = await getQueueStats();
  const pending = stats.pending + stats.failed;
  const badge = document.getElementById('queue-badge');
  if (badge) {
    if (pending > 0) {
      badge.textContent = pending > 9 ? '9+' : pending;
      badge.classList.remove('hidden');
      badge.classList.add('flex');
    } else {
      badge.classList.add('hidden');
      badge.classList.remove('flex');
    }
  }
}

function showToast(message) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 2500);
}

export function stopCamera() {
  stopCalibration();
  if (videoStream) {
    videoStream.getTracks().forEach((track) => track.stop());
    videoStream = null;
  }
}
