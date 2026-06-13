# Especificacion Tecnica Movil - OMR PWA

## 1. Descripcion General

Aplicacion Web Progresiva (PWA) para captura de cartillas de lectura OMR desde dispositivos moviles (Android/iOS). El sistema guia al usuario para alinear la cartilla dentro de un recuadro en pantalla, detecta automaticamente las cruces de las esquinas, y permite capturar la imagen para su posterior procesamiento OMR en el backend.

### Repositorios
| Repo | Rol | URL |
|------|-----|-----|
| omr-pwa-fase1 | Frontend PWA Mobile | https://github.com/norbertoochoa-web/omr-pwa-mobile |
| omr-pwa-fase2 | API Backend (FastAPI + OMR) | https://github.com/norbertoochoa-web/omr-pwa-fase2 |
| omr-pwa-fase3-portal | Portal Web administracion | https://github.com/norbertoochoa-web/omr-pwa-fase3-portal |

### Ramas
- `master`: estable, desplegada en VPS
- `main`: desarrollo

---

## 2. Arquitectura Mobile

[PWA Mobile] → HTTPS → [Caddy proxy] → [FastAPI Backend:8000]
     │                                              │
     ├─ Camara + Overlay guiado                     ├─ Recepcion de imagenes
     ├─ Deteccion de cruces (grid/bbox)             ├─ Procesamiento OMR
     ├─ IndexedDB Queue (offline)                   ├─ Generacion .txt
     └─ Sync Manager                                └─ Sesiones / DB

### Stack Tecnologico
| Capa | Tecnologia | Version |
|------|------------|---------|
| Build | Vite | ^5.0 |
| Framework | Vanilla JS + ES Modules | - |
| UI | TailwindCSS | ^3.4 |
| Offline | Dexie.js (IndexedDB) | ^3.2 |
| PWA | vite-plugin-pwa | Manifest + SW |
| Camara | getUserMedia + Canvas | - |

---

## 3. Flujo de la Aplicacion

### 3.1 Login
- Pantalla de login (email + password)
- POST /api/v1/auth/login → recibe JWT
- GET /api/v1/subscription/{user_id} → valida suscripcion activa
- JWT en sessionStorage (expira 12h)
- Si suscripcion inactiva → bloquea acceso a camara

### 3.2 Sesion
- Al entrar a camara se crea sesion via POST /api/v1/sessions
- Fallback: UUID local si API no responde
- Session ID se muestra en header
- Contador de capturas

### 3.3 Captura
- Video en vivo con overlay rectangular guiado
- 3 estados de calibracion (overlay-status):
  - Rojo: "Alinea la cartilla en el recuadro" (no detectada)
  - Amarillo: "Manten el celular quieto" (detectada pero inestable)
  - Verde: "Listo!" (detectada + enfocada + estable 5 frames) → habilita boton
- Captura manual via boton (auto-capture eliminado)
- Vibracion haptica al calibrar

### 3.4 Post-captura
- Imagen guardada en IndexedDB (cola offline)
- Subida automatica si hay conexion
- Sync manual con boton "Subir todo"
- Reintentos con backoff (1s, 2s, 4s, max 3)
- Descarga de .txt por sesion

---

## 4. Deteccion de Cartilla (detectCorners)

### 4.1 Algoritmo Actual (Opción B - Implementado 2026-06-12)
1. **Buscar pixel brillante** (gray > 180) → calcula bounding box de la cartilla blanca
2. **Validar**: brightRatio >= 15% y coverage bbox entre 20% y 95%
3. **Buscar cruces** en las 4 esquinas del bbox (cada esquina = 25% del bbox)
4. **Pixel oscuro** (gray < 80) → si en 3/4 esquinas hay >12% oscuridad = `alineado`
5. Si 2/4 = `descentrado`, menor = `sin_detectar`

### 4.2 Historia de Algoritmos (todos fallidos excepto Opcion B)
| Algoritmo | Fecha | Resultado |
|-----------|-------|-----------|
| bounding box (coverage 50%, darkRatio 2%, centering 15%) | 2026-06-11 | Falsos positivos con fondo texturado |
| 4 corner regions (regionRatio 0.30, dark 0.10) | 2026-06-11 | No detectaba cruces |
| bounding box relajado (darkRatio 0.5%, coverage 20%) | 2026-06-12 | Falsos positivos con cualquier superficie |
| Grid 6x6 (celdas 80px, umbral 15%) | 2026-06-12 | No detectaba cruces pequenas |
| Grid 12x12 (celdas 40px, umbral 10%) | 2026-06-12 | Detectaba pero inestable |
| Umbral adaptativo por celda (mean * 0.5) | 2026-06-12 | No funciono |
| **Opción B: bbox blanco + cruces en esquinas** | **2026-06-12** | **FUNCIONA** |

### 4.3 Pipeline de Calibracion
checkCalibration() por frame:
1. Extraer rectangulo visible (capture-area) a native video coords (getCalibrationRect)
2. Dibujar en canvas 480x480 (PROCESS_SIZE)
3. computeLaplacianVariance() → nitidez (threshold: 80)
4. computeFrameDiff() → estabilidad (threshold: 0.15)
5. detectCorners() → deteccion de cruces
6. Si nitido + estable + detectado por 5 frames consecutivos → calibrado

---

## 5. Overlay Visual

### 5.1 Rectangulo de Captura
- Dimensiones actuales: min(90vw, 360px) x min(120vw, 480px)
- Posicion: top-[44%], centrado horizontal
- Bordes blancos con esquinas en L (orientacion)
- Fondo exterior semi-oscuro (bg-black/40)

### 5.2 Estados (overlay-status)
Dentro del rectangulo, en -top-12:
- `alinear` → bg-red-500/90 "Alinea la cartilla en el recuadro"
- `quieto` → bg-yellow-500/90 "Manten el celular quieto"
- `listo` → bg-green-500/90 "Listo!"

### 5.3 Eliminado
- guidance-text (z-30 bottom-36) - mensajes 3 estados fuera del overlay
- Instrucciones estaticas (-bottom-16) "Alinea las marcas +"

---

## 6. Dependencias Externas

### 6.1 Backend API (omr-pwa-fase2)
- URL: https://162.35.161.249.nip.io/api/v1 (via Caddy)
- Puerto interno: 8000
- Auth: JWT
- Endpoints: /auth/login, /subscription/{id}, /sessions, /upload, /sessions/{id}/download
- OMR: OpenCV procesamiento de imagenes
- Output: .txt compatible con Delphi 7

### 6.2 Portal (omr-pwa-fase3-portal)
- URL: https://162.35.161.249.nip.io (via Caddy)
- Puerto interno: 8001
- Login: admin@catolico.cl / qwerty1
- Dashboard de sesiones, galeria de imagenes, descarga .txt

### 6.3 VPS
- IP: 162.35.161.249
- Usuario: opencode
- SO: Ubuntu
- Servicios: Docker (API + Portal), Caddy (proxy + HTTPS), n8n
- Data: /var/omr/data/ (bind mount compartido)
- Frontend estatico: /var/www/imax-pwa/

---

## 7. Lo que Funciona Actualmente

- [x] Login con JWT + validacion de suscripcion
- [x] Creacion de sesion (API o local fallback)
- [x] Stream de camara con overlay guiado
- [x] Rectangulo de captura con esquinas en L
- [x] 3 estados de calibracion (rojo/amarillo/verde)
- [x] Deteccion de cartilla blanca (Opción B - bbox + cruces)
- [x] Captura manual de imagen
- [x] Cola offline en IndexedDB (PENDING/UPLOADING/SUCCESS/FAILED)
- [x] Subida a API con reintentos
- [x] Sync manual y auto-sync
- [x] Descarga de .txt por sesion
- [x] Cierre de sesion
- [x] PWA installable (Service Worker + manifest)
- [x] Contador de capturas en header

---

## 8. Lo que NO Funciona / Estamos Trabajando

### 8.1 Problemas Conocidos
- [ ] **Deteccion inestable**: La Opcion B funciona pero puede fallar si:
  - La cartilla tiene sombras o reflejos (brightThreshold=180 no alcanza)
  - El bbox blanco es muy pequeno (cartilla lejana)
  - Las cruces no son lo suficientemente oscuras (<80)
- [ ] **Rectangulo puede quedar desbordado**: En pantallas pequenas, el rectangulo 90vw x 120vw puede salirse de los margenes si no hay suficiente espacio vertical
- [ ] **Sin feedback visual de falla**: Cuando la deteccion no funciona, solo muestra "Alinea la cartilla" sin indicar por que (brillo insuficiente? bbox mal? esquinas sin detectar?)

### 8.2 Funcionalidades Faltantes
- [ ] **Auto-capture**: Se elimino por bugs pero el usuario quiere recuperarlo o similar
- [ ] **Selector de camara**: No permite cambiar entre camara frontal/trasera
- [ ] **Preview de imagen capturada**: No muestra la imagen antes de enviar
- [ ] **Editar/eliminar capturas**: No permite borrar una captura erronea de la sesion
- [ ] **Historial de sesiones**: No hay pantalla de historial, solo la sesion actual
- [ ] **Modo oscuro/claro**: No implementado
- [ ] **Internacionalizacion**: Solo espanol hardcodeado
- [ ] **Accesibilidad**: Sin soporte para screen readers, contraste minimo
- [ ] **Offline completo**: Si no hay conexion inicial, no puede hacer login ni crear sesion

### 8.3 Mejoras Pendientes
- [ ] **Indicador de progreso en upload**: No muestra barra de progreso al subir imagenes
- [ ] **Zoom digital**: No permite acercar/alejar vista de camara
- [ ] **Grid de alineacion**: No tiene lineas de ayuda horizontal/vertical dentro del overlay
- [ ] **Tolerancia a rotacion**: No maneja bien si el usuario gira el telefono
- [ ] **Calibracion mas robusta**: El pipeline 480x480 + deteccion podria fallar en condiciones de poca luz

---

## 9. Archivos Clave del Frontend

| Archivo | Rol | Lineas |
|---------|-----|--------|
| frontend/src/main.js | Entry point, routing | - |
| frontend/src/screens/Login.js | Pantalla de login | - |
| frontend/src/screens/Camera.js | Pantalla principal de camara + overlay + captura | ~527 |
| frontend/src/screens/Queue.js | Pantalla de cola offline | - |
| frontend/src/core/camera.js | Logica de calibracion, deteccion de cruces | ~218 |
| frontend/src/core/api.js | Llamadas a API REST | - |
| frontend/src/core/db.js | IndexedDB (Dexie) operaciones | - |
| frontend/src/core/state.js | Estado global (JWT, usuario) | - |
| frontend/src/style.css | Estilos custom (poco) | - |
| frontend/tailwind.config.js | Configuracion Tailwind | - |
| frontend/vite.config.js | Configuracion Vite + PWA | - |
| frontend/public/manifest.webmanifest | Manifest PWA | - |

---

## 10. Comandos de Desarrollo

```bash
# Frontend (dev)
cd frontend && npm install && npm run dev

# Frontend (build)
cd frontend && npm run build

# Deploy a VPS
ssh opencode@162.35.161.249
cd /home/opencode/omr-pwa-mobile && git pull origin master && cd frontend && npm run build && sudo cp -r dist/* /var/www/imax-pwa/
```

### Variables de Entorno (.env)
```
VITE_API_URL=https://162.35.161.249.nip.io/api/v1
VITE_LAPLACIAN_THRESHOLD=80
VITE_STABILITY_THRESHOLD=0.15
```

---

## 11. Notas de Sesiones Anteriores

Los resumenes detallados por sesion estan en:
- /home/rodrigo/Workspace/Imax/Mobil_web/iteracciones/opencode_20260611_142624.txt
- /home/rodrigo/Workspace/Imax/Mobil_web/iteracciones/opencode_20260611_223647.txt
- /home/rodrigo/Workspace/Imax/Mobil_web/iteracciones/opencode_20260611_224920.txt
- /home/rodrigo/Workspace/Imax/Mobil_web/iteracciones/opencode_20260612_000605.txt
- /home/rodrigo/Workspace/Imax/Mobil_web/iteracciones/opencode_20260612_002800.txt
- /home/rodrigo/Workspace/Imax/Mobil_web/iteracciones/opencode_20260612_005200.txt
- /home/rodrigo/Workspace/Imax/Mobil_web/iteracciones/opencode_20260612_005800.txt
- /home/rodrigo/Workspace/Imax/Mobil_web/iteracciones/opencode_20260612_011500.txt

---

## 12. Proximos Pasos Recomendados

1. **Estabilizar deteccion** (Opción B): ajustar thresholds brightThreshold y darkThreshold segun condiciones reales de luz
2. **Reducir rectangulo** si se sale de pantalla en dispositivos pequenos
3. **Agregar auto-capture** cuando detecte estable por N frames
4. **Feedback visual de diagnostico**: mostrar brightRatio, coverage, cornersDetected en debug
5. **Selector de camara frontal/trasera**
6. **Preview post-captura** antes de enviar
