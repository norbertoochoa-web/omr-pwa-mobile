# 📄 ESPECIFICACIÓN TÉCNICA: FASE 1 - PWA OMR MOBILE (Mock API)

## 📋 1. DESCRIPCIÓN GENERAL
Aplicación Web Progresiva (PWA) responsiva para captura de cartillas de lectura OMR desde dispositivos móviles. Diseñada para operar en Fase 1 con un **API Mock local**, gestionando autenticación, verificación de suscripción, captura guiada con calibración automática (🔴→🟢), cola offline y sincronización. El sistema genera un archivo `.txt` estrictamente compatible con **Delphi 7** para integración con el cliente desktop existente.

## 🏗️ 2. ARQUITECTURA (FASE 1)
[PWA Frontend] → HTTPS → [Mock API Express (Local)]
     │                       │
     ├─ Auth + Subscription  ├─ JWT + Delay Simulado
     ├─ Camera + Overlay     ├─ Upload Reception
     ├─ IndexedDB Queue      ├─ .txt Generation
     └─ Sync Manager         └─ CORS / Headers


## 🛠️ 3. STACK TECNOLÓGICO
| Capa | Tecnología | Versión/Nota |
|------|------------|--------------|
| Build Tool | Vite | `^5.0` |
| Framework | Vanilla JS + ES Modules | Sin frameworks pesados |
| UI/UX | TailwindCSS | `^3.4` |
| Estado/Offline | Dexie.js (IndexedDB Wrapper) | `^3.2` |
| Mock API | Node.js + Express + Multer | `^4.18` |
| PWA | `vite-plugin-pwa` | Manifest + SW |
| Linter/Format | ESLint + Prettier | Config estricta |

## 📱 4. REQUERIMIENTOS FUNCIONALES
### 4.1 Autenticación & Suscripción
- Pantalla de login (email + password).
- Consumo `POST /api/v1/auth/login`.
- Validación de suscripción vía `GET /api/v1/subscription/{user_id}`.
- Si `status !== "ACTIVE"` → bloquear acceso a cámara, mostrar mensaje de renovación.
- JWT almacenado en `sessionStorage` (expira en 12h).

### 4.2 Captura con Calibración Inteligente
- Overlay cuadrado central (60% viewport width).
- Estados visuales: 🔴 Rojo (no calibrado) → 🟢 Verde (calibrado).
- Cálculo cada 200ms usando `requestVideoFrameCallback` o `setInterval`.
- Habilitar botón de captura SOLO cuando esté verde.
- Vibración háptica (`navigator.vibrate(50)`) al calibrar.

### 4.3 Cola Offline & Sincronización
- Almacén en IndexedDB vía Dexie: `photo_queue` table.
- Estados por item: `PENDING`, `UPLOADING`, `SUCCESS`, `FAILED`.
- Sync manual (`📤 Subir todo`) + auto-sync cuando `navigator.onLine === true`.
- Reintentos con backoff exponencial (1s, 2s, 4s, máx 3).

### 4.4 Generación & Descarga `.txt`
- Al cerrar sesión o pulsar "Finalizar", se descarga el `.txt` generado por el Mock API.
- Formato estricto para Delphi 7 (ver sección 7).

## 🔌 5. ESPECIFICACIÓN API MOCK
**Base URL:** `http://localhost:3001/api/v1`
**Headers comunes:** `Authorization: Bearer <JWT>`, `Content-Type: multipart/form-data` (para upload)

| Método | Ruta | Payload | Response (200) | Error (4xx/5xx) |
|--------|------|---------|----------------|-----------------|
| `POST` | `/auth/login` | `{email, password}` | `{token, user_id, subscription}` | `401 INVALID_CRED` |
| `GET`  | `/subscription/{id}` | - | `{status, max_images, expires}` | `403 NOT_SUBSCRIBED` |
| `POST` | `/sessions` | `{session_id, user_id}` | `{session_token, status: "OPEN"}` | `409 DUPLICATE_SESSION` |
| `POST` | `/upload` | `FormData: image, session_id, timestamp` | `{image_id, status: "RECEIVED"}` | `400 INVALID_FORMAT` |
| `GET`  | `/sessions/{id}/download` | - | `application/octet-stream` (.txt) | `404 SESSION_NOT_FOUND` |

## 📷 6. LÓGICA DE CALIBRACIÓN (🔴 → 🟢)
```javascript
// Pseudo-código para implementación JS
const ROI_SIZE = 320;
const SHARPNESS_THRESHOLD = 80;
const STABILITY_THRESHOLD = 0.15;
let prevFrame = null;

function checkCalibration(videoElement, canvas, ctx) {
  ctx.drawImage(video, 0, 0, ROI_SIZE, ROI_SIZE);
  const imageData = ctx.getImageData(0, 0, ROI_SIZE, ROI_SIZE);
  const pixels = imageData.data;

  // 1. Varianza Laplaciana (enfoque)
  const variance = computeLaplacianVariance(pixels, ROI_SIZE);
  // 2. Diferencia con frame anterior (estabilidad)
  const diff = computeFrameDiff(pixels, prevFrame);

  const isSharp = variance > SHARPNESS_THRESHOLD;
  const isStable = diff < STABILITY_THRESHOLD;

  if (isSharp && isStable) {
    setOverlayColor('green');
    enableCapture(true);
  } else {
    setOverlayColor('red');
    enableCapture(false);
  }
  prevFrame = pixels;
}

7. FORMATO .TXT (COMPATIBLE DELPHI 7)

    Encoding: UTF-8 SIN BOM
    Line Ending: CRLF (\r\n)
    Delimiter: ; (punto y coma)
    Estructura:
[SESSION]
ID=CLASE_A_20260521
PROFESOR=JUAN.PER
FECHA=21/05/2026 10:30:15
[DATA]
A001;A;B;;D;A;OK
A002;;C;B;A;;ERR_BLANK
A003;B;B;C;D;A;OK
[END]
TOTAL=3
ERRORES=1

8. ESTRUCTURA DE ARCHIVOS
/omr-pwa-fase1
├── /frontend
│   ├── /public          # manifest.json, icons
│   ├── /src
│   │   ├── /assets
│   │   ├── /components  # Overlay, QueueItem, Login
│   │   ├── /core        # api.js, camera.js, db.js, state.js
│   │   ├── /screens     # Login, Camera, History
│   │   ├── main.js
│   │   └── index.html
│   ├── vite.config.js
│   └── package.json
├── /mock-api
│   ├── index.js
│   ├── routes/
│   ├── data/            # mock_sessions.json
│   └── package.json
└── SPEC_FASE1_OMR_PWA.md

CONFIGURACIÓN Y EJECUCIÓN
9.1 Variables de Entorno (.env)
VITE_API_URL=http://localhost:3001/api/v1
VITE_MOCK_MODE=true
VITE_LAPLACIAN_THRESHOLD=80

9.2 Comandos
# Mock API
cd mock-api && npm install && npm run dev

# Frontend PWA
cd frontend && npm install && npm run dev

10. CRITERIOS DE ACEPTACIÓN (FASE 1)

    Login valida credenciales y bloquea si suscripción inactiva.
    Overlay cambia a verde solo cuando imagen está enfocada y estable.
    Captura guarda en IndexedDB incluso sin conexión.
    Sincronización reenvía pendientes con reintentos.
    Archivo .txt descargado se parsea correctamente en Delphi 7 (sin errores de encoding o delimitadores).
    PWA instalable y funciona en iOS Safari / Android Chrome.

11.FASES FUTURAS (CONTRATO DE COMPATIBILIDAD)
    Fase 2: Swap de VITE_API_URL a Python FastAPI. Endpoints idénticos. Agregar JWT real, Celery queue, OMR OpenCV.
    Fase 3: Migración a Flutter manteniendo misma API REST. Reutilizar lógica de calibración (adaptar a camera_controller + image package).


 
