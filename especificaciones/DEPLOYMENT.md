# OMR PWA — Especificación del Proyecto

## Visión General

Sistema PWA de captura y procesamiento OMR (Optical Mark Recognition) para leer cartillas de respuestas desde dispositivos móviles. Compuesto por 3 repositorios independientes, un backend FastAPI con OpenCV, y un portal web de administración.

---

## 1. Repositorios

| Repo | Directorio local (notebook) | Rol | GitHub |
|---|---|---|---|
| `omr-pwa-mobile` | `omr-pwa-fase1/` | Frontend PWA (cámara + login + cola offline) | `norbertoochoa-web/omr-pwa-mobile` |
| `omr-pwa-fase2` | `omr-pwa-fase2/` | API Backend (FastAPI + OpenCV OMR + PostgreSQL) | `norbertoochoa-web/omr-pwa-fase2` |
| `omr-pwa-fase3-portal` | `omr-pwa-fase3-portal/` | Portal web (dashboard, QR, descargas) | `norbertoochoa-web/omr-pwa-fase3-portal` |

### Ramas

| Rama | Propósito |
|---|---|
| `master` | **Estable** — desplegada en VPS. Lo que está aquí se refleja en producción. |
| `main` | **Desarrollo** — trabajo diario, cambios sin probar. |

### Flujo de trabajo

1. **Todos los cambios se hacen en el notebook** (rama `main`)
2. **Subir a VPS** para pruebas: sync via git (cherry-pick) entre `main` (notebook) y `master` (VPS)
3. **Probar en VPS** hasta que funcione correctamente
4. **Solo cuando esté estable**: merge `main` → `master` en notebook y push a GitHub

**Regla**: GitHub recibe push ÚNICAMENTE cuando hay una versión completamente probada (para permitir rollback histórico).

---

## 2. Arquitectura del Sistema

```
[Usuario Mobile]
      │
      ▼
[PWA en navegador] ─── HTTPS ───► [Caddy Proxy :443]
                                        │
                          ┌─────────────┼──────────────┐
                          ▼             ▼              ▼
                   [/var/www/imax-pwa]  │              │
                   (Frontend estático)  │              │
                                        │              │
                          ┌─────────────┘              │
                          ▼                            ▼
                   [API Docker :8000]          [Portal Docker :8001]
                          │                            │
                          └──────────┬─────────────────┘
                                     ▼
                            [PostgreSQL :5432]
                                    │
                                    ▼
                          [/var/omr/data/outputs/]
```

### Stack Tecnológico

**Frontend Mobile**
- Vanilla JS + ES Modules
- Vite 5 (build)
- TailwindCSS 3.4
- Dexie.js (IndexedDB para cola offline)
- vite-plugin-pwa (Service Worker + manifest)

**Backend API**
- FastAPI (Python 3.11)
- OpenCV 4.13 (procesamiento OMR)
- SQLAlchemy 2.0 + asyncpg (PostgreSQL)
- python-jose (JWT)
- Uvicorn (4 workers)

**Portal**
- FastAPI + Jinja2 templates
- TailwindCSS via CDN
- qrcode[pil] (generación QR)
- Misma DB que API

**Infraestructura (VPS)**
- Ubuntu, Docker + Docker Compose
- Caddy 2 (proxy reverso + HTTPS automático)
- PostgreSQL 16 (contenedor Docker)

---

## 3. VPS — Servidor de Producción

| Recurso | Valor |
|---|---|
| IP | `162.35.161.249` |
| Usuario SSH | `opencode` |
| SO | Ubuntu |
| RAM | 2 GB |
| Disco | 30 GB SSD |
| Hostname | `162.35.161.249.nip.io` (HTTPS via Caddy) |
| Dominio real | `app.imaxing.cl`, `api.imaxing.cl`, `portal.imaxing.cl` |

### Servicios en Producción

| Servicio | Puerto | Acceso vía Caddy |
|---|---|---|
| Frontend PWA | Estático | `https://app.imaxing.cl` |
| API Backend | `:8000` | `https://api.imaxing.cl` / `https://app.imaxing.cl/api/` |
| Portal Web | `:8001` | `https://portal.imaxing.cl` / `https://app.imaxing.cl/portal/` |
| PostgreSQL | `:5432` (loopback) | Solo interno Docker |

### Docker Compose

**Backend** (`~/omr-pwa-fase2/docker-compose.prod.yml`):
```yaml
services:
  db: postgres:16-alpine, puerto 5432 loopback
  api: build desde Dockerfile, puerto 8000, workers 4
```

**Portal** (`~/omr-pwa-fase3-portal/docker-compose.yml`):
```yaml
services:
  portal: build desde Dockerfile, network_mode: host
```

### Caddy (`/etc/caddy/Caddyfile`)
```caddy
{
    email admin@imaxing.cl
}

app.imaxing.cl {
    root * /var/www/imax-pwa
    file_server
    handle /api/* { reverse_proxy localhost:8000 }
    handle /portal/* { reverse_proxy localhost:8001 }
}
```

---

## 4. Directorios y Datos Compartidos

| Ruta | Contenido | Montado en |
|---|---|---|
| `/var/omr/data/outputs/` | Resultados OMR por institución | API + Portal (bind mount) |
| `/var/omr/data/errores/` | Imágenes con error de procesamiento | API |
| `/var/www/imax-pwa/` | Frontend estático PWA | Caddy |
| `~/omr-pwa-fase2/` | Código fuente API | VPS |
| `~/omr-pwa-fase3-portal/` | Código fuente Portal | VPS |

### Estructura de outputs

```
/var/omr/data/outputs/
  └── {institution_id}/
      ├── {session_id}/
      │   ├── images/
      │   │   ├── imagen_1.jpg
      │   │   └── imagen_2.jpg
      │   ├── results.txt
      │   └── resultados.json
      └── ...
```

---

## 5. Base de Datos

Compartida entre API y Portal. Misma instancia PostgreSQL, mismas tablas.

| Tabla | Propósito | Creada por |
|---|---|---|
| `users` | Usuarios de la app móvil | API (fase2) |
| `client_users` | Usuarios del portal web | Portal (fase3) |
| `templates` | Plantillas de cartillas OMR | API |
| `sessions` | Sesiones de captura | API |
| `images` | Imágenes capturadas y sus resultados | API |

### Conexión

```
API:   postgresql+asyncpg://omr_user:omr_pass@db:5432/omr_pwa
Portal: postgresql+asyncpg://omr_user:omr_pass@localhost:5432/omr_pwa
```

### Seed automático

Al iniciar el contenedor API, se ejecuta `python -m app.seed` que crea:
- Usuario admin: `admin@catolico.cl` / `qwerty1`
- Template demo `catolico` para institución `catolico`

**⚠️ Si se recrea el contenedor DB, el seed no se ejecuta automáticamente** porque la DB persiste en volumen Docker. Para resetear:
```bash
sudo docker compose -f docker-compose.prod.yml down -v  # borra volúmenes
sudo docker compose -f docker-compose.prod.yml up -d     # recrea con seed
```

---

## 6. Autenticación

### App Móvil (PWA)

| Endpoint | Método | Descripción |
|---|---|---|
| `POST /api/v1/auth/login` | Login email+password | Retorna JWT (12h) |
| `POST /api/v1/auth/sso` | SSO con token QR | Retorna JWT (12h) |

**Flujo QR**:
1. Portal genera QR con token JWT (`type: qr_access`, expira 5 min)
2. QR apunta a `{PWA_BASE_URL}?institution={id}&token={jwt}`
3. Frontend lee `token` de la URL, llama a `/auth/sso`
4. Backend valida JWT QR, busca `User` vinculado a la `institution_id` (vía sesiones), retorna JWT de sesión
5. Si no hay usuario para esa institución → error 401

### Portal Web

- Login con email+password contra `client_users`
- JWT en cookie httponly (24h)
- Cada cliente ve solo sus propias sesiones (filtradas por `institution_id`)

### Tokens QR

Secreto compartido entre API y Portal: ambas apps usan el mismo `SECRET_KEY` y `JWT_ALGORITHM`, por lo que cualquier app puede decodificar los tokens de la otra.

---

## 7. Procesamiento OMR (Backend)

### Pipeline

1. **CropOnMarkers**: Detecta 4 marcadores negros en esquinas, aplica transformación de perspectiva
2. **AutoAlign**: Barrido para detectar desplazamiento real de bloques
3. **Threshold**: Umbral adaptativo local + global
   - Global: blended gap+otsu (60/40) con clamp [95, 210]
   - Safety cap: si marked_ratio > 85%, threshold se fija en p85+15
4. **Evaluación**: Compara burbujas marcadas contra respuestas correctas
5. **Output**: Resultados en DB, TXT, e imágenes de verificación

### Valores por defecto

| Parámetro | Valor | Archivo |
|---|---|---|
| `MIN_JUMP` | 15 | `defaults.py` |
| `PAGE_TYPE_FOR_THRESHOLD` | `white` | `defaults.py` |
| `GLOBAL_PAGE_THRESHOLD_WHITE` | 200 | `constants.py` |
| `PROCESS_SIZE` | 480×480 | `camera.js` (frontend) |

### Verdictos

| Condición | Verdicto | TXT |
|---|---|---|
| 0 marcadas | BLANK | vacío |
| 1 marcada (correcta) | Correct | letra (A/B/C/D/E) |
| 1 marcada (incorrecta) | Incorrect | letra |
| 2+ marcadas | ERROR | E |

---

## 8. Detección de Cartilla (Frontend)

### Opción B (actual, implementada 2026-06-12)

1. Buscar pixel brillante (gray > 180) → bounding box de cartilla blanca
2. Validar: brightRatio ≥ 15% y coverage bbox 20–95%
3. Buscar cruces en 4 esquinas del bbox (cada esquina = 25%)
4. Pixel oscuro (gray < 80): 3/4 esquinas con >12% oscuridad = `alineado`
5. 2/4 = `descentrado`, menor = `sin_detectar`

### Pipeline de calibración (por frame)

```
getCalibrationRect() → ROI con márgenes 3%
draw en canvas 480×480 (PROCESS_SIZE)
computeLaplacianVariance() → nitidez (threshold: 80)
computeFrameDiff() → estabilidad (threshold: 0.15)
detectCorners() → detección de cruces
Si todo OK por 5 frames consecutivos → calibrado
```

### Dimensiones del rectángulo de captura

```
Ancho:  min(96vw, 520px, calc((100dvh - 230px) * 0.695))
Alto:   min(calc(96vw / 0.695), 820px, calc(100dvh - 230px))
```

Aspect ratio: 0.695 (match plantilla 1600:2300). Márgenes ROI: 3% en ambos ejes.

---

## 9. Deploy Notebook → VPS (Flujo Diario)

### Prerrequisitos

- SSH key configurada para `opencode@162.35.161.249`
- `rsync` instalado en notebook y en VPS
- Docker + Docker Compose en VPS
- Notebook: haber hecho `npm run build` para frontend

### Sincronización de código (notebook ↔ VPS)

El código viaja entre notebook y VPS usando git patches (cherry-pick entre ramas):

```bash
# Notebook → VPS: generar patch desde main (notebook) y aplicar en master (VPS)
cd /home/rodrigo/Workspace/Imax/Mobil_web/<repo>
git format-patch --stdout -1 <commit-hash> > /tmp/patch.patch
rsync /tmp/patch.patch opencode@162.35.161.249:/tmp/
ssh opencode@162.35.161.249 "cd ~/<repo> && git am /tmp/patch.patch"

# VPS → Notebook: generar patch desde master (VPS) y aplicar en main (notebook)
ssh opencode@162.35.161.249 "cd ~/<repo> && git format-patch --stdout -1 <commit-hash>" > /tmp/patch.patch
cd /home/rodrigo/Workspace/Imax/Mobil_web/<repo> && git checkout main && git am /tmp/patch.patch
```

### 9.1 Frontend (omr-pwa-mobile)

```bash
# 1. Build
cd /home/rodrigo/Workspace/Imax/Mobil_web/omr-pwa-fase1/frontend
npm run build

# 2. Copiar a VPS (sobrescribe archivos existentes)
rsync -avz --rsync-path="sudo rsync" dist/* \
  opencode@162.35.161.249:/var/www/imax-pwa/

# 3. (Opcional) Verificar
curl -sI https://162.35.161.249.nip.io | head -5
```

### 9.2 Backend API (omr-pwa-fase2)

```bash
# 1. Sincronizar código Python (excluyendo __pycache__ y .git)
rsync -avz --rsync-path="sudo rsync" \
  --exclude='__pycache__' --exclude='.git' \
  /home/rodrigo/Workspace/Imax/Mobil_web/omr-pwa-fase2/app/ \
  opencode@162.35.161.249:~/omr-pwa-fase2/app/

# 2. Opción A: Solo reiniciar contenedor (sin rebuild, si hay bind mount)
ssh opencode@162.35.161.249 \
  "sudo docker compose -f ~/omr-pwa-fase2/docker-compose.prod.yml restart api"

# 3. Opción B: Rebuild completo (cuando cambian dependencias o Dockerfile)
ssh opencode@162.35.161.249 \
  "cd ~/omr-pwa-fase2 && \
   sudo docker compose -f docker-compose.prod.yml build --no-cache api && \
   sudo docker compose -f docker-compose.prod.yml up -d api"

# 4. Verificar logs
ssh opencode@162.35.161.249 \
  "sudo docker compose -f ~/omr-pwa-fase2/docker-compose.prod.yml logs api --tail=20"
```

### 9.3 Portal (omr-pwa-fase3-portal)

```bash
# 1. Sincronizar código
rsync -avz --rsync-path="sudo rsync" \
  --exclude='__pycache__' --exclude='.git' --exclude='venv' \
  /home/rodrigo/Workspace/Imax/Mobil_web/omr-pwa-fase3-portal/app/ \
  opencode@162.35.161.249:~/omr-pwa-fase3-portal/app/

# 2. Rebuild y restart
ssh opencode@162.35.161.249 \
  "cd ~/omr-pwa-fase3-portal && \
   sudo docker compose build --no-cache portal && \
   sudo docker compose up -d portal"

# 3. O si ya tiene bind mount:
ssh opencode@162.35.161.249 \
  "sudo docker compose -f ~/omr-pwa-fase3-portal/docker-compose.yml restart portal"
```

### 9.4 Portal requiere rebuild siempre

Actualmente `docker-compose.yml` del portal NO tiene bind mount del código (el código se copia dentro de la imagen en el build). Para deploy sin rebuild, se necesitaría agregar un volumen bind similar a:

```yaml
volumes:
  - ./app:/app/app
```

Si no se agrega, cada cambio en el portal requiere `docker compose build --no-cache portal && docker compose up -d portal`.

---

## 10. Deploy a GitHub (Solo Versiones Estables)

Cuando el código en VPS está completamente probado y se desea preservar una versión:

```bash
# Por cada repo:
git checkout main
git add -A && git commit -m "feat: descripción del cambio"
git push origin main

git checkout master
git merge main
git push origin master
git checkout main
```

Esto permite:
- Hacer `git log` para ver historial de cambios
- Hacer `git checkout <hash>` para volver a una versión anterior
- Clonar desde cero si el VPS falla

---

## 11. Rollback

### Frontend
```bash
# VPS: restaurar desde backup de dist/ o desde git
ssh opencode@162.35.161.249 \
  "cd ~/omr-pwa-mobile && git checkout <hash-anterior> -- frontend/dist/ && \
   sudo cp -r frontend/dist/* /var/www/imax-pwa/"
```

### Backend API
```bash
# VPS: checkout a commit anterior y rebuild
ssh opencode@162.35.161.249 \
  "cd ~/omr-pwa-fase2 && \
   git checkout <hash-anterior> && \
   sudo docker compose -f docker-compose.prod.yml build --no-cache api && \
   sudo docker compose -f docker-compose.prod.yml up -d api"
```

### Portal
```bash
ssh opencode@162.35.161.249 \
  "cd ~/omr-pwa-fase3-portal && \
   git checkout <hash-anterior> && \
   sudo docker compose build --no-cache portal && \
   sudo docker compose up -d portal"
```

### Base de datos
```bash
# Si el schema cambió, restaurar desde backup:
sudo docker exec -i omr-pwa-fase2-db-1 psql -U omr_user omr_pwa < backup.sql
```

---

## 12. Variables de Entorno Clave

### Backend API (`~/omr-pwa-fase2/.env`)
```env
POSTGRES_USER=omr_user
POSTGRES_PASSWORD=omr_pass
POSTGRES_DB=omr_pwa
SECRET_KEY=f3a8c9e1b7d24f5690ab12cd34ef56789012abcd3456ef78901234567890abcd
JWT_ALGORITHM=HS256
JWT_EXPIRATION_HOURS=12
DEBUG=false
```

### Portal (`~/omr-pwa-fase3-portal/.env`)
```env
POSTGRES_HOST=localhost
POSTGRES_USER=omr_user
POSTGRES_PASSWORD=omr_pass
POSTGRES_DB=omr_pwa
SECRET_KEY=f3a8c9e1b7d24f5690ab12cd34ef56789012abcd3456ef78901234567890abcd
JWT_ALGORITHM=HS256
PWA_BASE_URL=https://app.imaxing.cl
```

### Frontend (`frontend/.env`)
```env
VITE_API_URL=https://162.35.161.249.nip.io/api/v1
VITE_LAPLACIAN_THRESHOLD=80
VITE_STABILITY_THRESHOLD=0.15
```

---

## 13. Archivos Clave por Repo

### Frontend (omr-pwa-mobile)

| Archivo | Rol |
|---|---|
| `frontend/src/main.js` | Entry point, SSO, routing |
| `frontend/src/screens/Camera.js` | Cámara + overlay + captura |
| `frontend/src/screens/Login.js` | Login email/password |
| `frontend/src/screens/Queue.js` | Cola offline (IndexedDB) |
| `frontend/src/core/camera.js` | Calibración, detección de cruces |
| `frontend/src/core/api.js` | Llamadas API REST |
| `frontend/src/core/db.js` | Operaciones IndexedDB (Dexie) |
| `frontend/src/core/state.js` | JWT + estado de usuario |
| `frontend/vite.config.js` | Build + PWA config |

### Backend API (omr-pwa-fase2)

| Archivo | Rol |
|---|---|
| `app/main.py` | Entry point FastAPI, rutas |
| `app/routes/auth.py` | Login + SSO |
| `app/routes/upload.py` | Subida de imágenes |
| `app/routes/sessions.py` | CRUD sesiones |
| `app/services/omr_service.py` | Procesamiento OMR |
| `app/services/auth_service.py` | JWT + autenticación |
| `app/omr_engine/core.py` | Motor OMR (threshold, lectura) |
| `app/omr_engine/evaluation.py` | Evaluación de respuestas |
| `app/omr_engine/image_utils.py` | Utilidades OpenCV |
| `app/models/__init__.py` | Modelos SQLAlchemy |
| `docker-compose.prod.yml` | Producción con workers=4 |

### Portal (omr-pwa-fase3-portal)

| Archivo | Rol |
|---|---|
| `app/main.py` | Entry point FastAPI |
| `app/routes/portal.py` | Dashboard, QR, descargas |
| `app/routes/auth_routes.py` | Login portal |
| `app/models.py` | Modelo ClientUser |
| `app/models_db.py` | Modelos Session/Image (solo lectura) |
| `app/auth.py` | JWT + tokens QR |
| `app/templates/portal/` | Jinja2 templates |

---

## 14. Comandos Útiles

### Diagnóstico VPS

```bash
# Ver estado de contenedores
ssh opencode@162.35.161.249 "sudo docker ps"

# Ver logs de API
ssh opencode@162.35.161.249 \
  "sudo docker compose -f ~/omr-pwa-fase2/docker-compose.prod.yml logs api --tail=50 -f"

# Ver logs de Portal
ssh opencode@162.35.161.249 \
  "sudo docker compose -f ~/omr-pwa-fase3-portal/docker-compose.yml logs portal --tail=50 -f"

# Ver estado de Caddy
ssh opencode@162.35.161.249 "sudo systemctl status caddy"

# Ver espacio en disco
ssh opencode@162.35.161.249 "df -h"

# Ver uso de RAM
ssh opencode@162.35.161.249 "free -h"

# Ver datos de output
ssh opencode@162.35.161.249 "sudo ls -la /var/omr/data/outputs/"
```

### Limpieza de datos

Hay un script `~/cleanup-omr-data.sh` que elimina outputs con más de 30 días. Se ejecuta via cron.

### Prueba rápida de la API

```bash
# Health check
curl -s https://162.35.161.249.nip.io/api/v1/health | jq .

# Login
curl -s -X POST https://162.35.161.249.nip.io/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@catolico.cl","password":"qwerty1"}' | jq .

# SSO (requiere token QR válido)
curl -s -X POST https://162.35.161.249.nip.io/api/v1/auth/sso \
  -H "Content-Type: application/json" \
  -d '{"token":"<qr_jwt_token>"}' | jq .
```

---

## 15. Troubleshooting

### Problema: Login portal falla después de recrear DB
**Causa**: Pool de conexiones del portal tiene conexiones obsoletas.
**Solución**: `sudo docker compose -f ~/omr-pwa-fase3-portal/docker-compose.yml restart portal`

### Problema: API responde 500, imagen muy oscura
**Causa**: Umbral global `global_thr=200` no funciona en imágenes con mean < 80.
**Solución**: El backend tiene safety cap que fija threshold a p85+15 si marked_ratio > 85%. Si aun así falla, la imagen es irrecuperable (muy oscura). El frontend debería rechazar capturas con brightness < 80.

### Problema: QR code no autentica
**Causa 1**: Frontend no lee `token` de la URL (main.js solo leía `sso_token`).
**Fix**: `const ssoToken = params.get('sso_token') || params.get('token');`

**Causa 2**: Backend no tiene endpoint `/auth/sso`.
**Fix**: Agregar ruta POST que valida QR JWT y retorna JWT de sesión.

**Causa 3**: PWA_BASE_URL en portal apunta a dominio incorrecto.
**Solución**: Configurar `PWA_BASE_URL` en `.env` del portal al dominio correcto.

### Problema: Worker queda en estado "no saludable"
**Causa**: DB no accesible durante inicio.
**Solución**: Revisar que el contenedor DB esté saludable: `sudo docker ps`. Si es necesario, reiniciar ambos: `sudo docker compose -f docker-compose.prod.yml restart`.

### Problema: build de Docker lento en VPS
**Causa**: VPS con solo 2GB RAM, sin cache de Docker.
**Solución**: Usar `--no-cache` solo cuando sea necesario. Para cambios de código, usar rsync + restart (si hay bind mount) o solo rebuild de capas de código (COPY . .).

---

## 16. Próximos Pasos / Roadmap

- [ ] Bind mount para código backend (evitar rebuild en cada deploy)
- [ ] Rechazo de imágenes muy oscuras en frontend (brightness check)
- [ ] Selector de cámara frontal/trasera
- [ ] Preview post-captura
- [ ] Pantalla de historial de sesiones
- [ ] Indicador de progreso en upload
- [ ] Auto-capture cuando estable por N frames
- [ ] PWA_BASE_URL configurable por entorno

---

*Documento generado el 2026-06-17. Última actualización: 2026-06-17. Mantener actualizado con cada cambio significativo en el flujo de deploy.**
