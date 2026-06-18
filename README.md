# OMR PWA — Mobile

Frontend PWA para captura y procesamiento OMR de cartillas de respuestas.

## Changelog

| Fecha | Modelo IA | Archivo(s) | Cambio |
|---|---|---|---|
| 2026-06-17 | deepseek-v4-flash-free | `frontend/src/screens/Camera.js` | Fix: agregar botón flotante de captura + debounce 2seg para UX rápida (50 cartillas) |
| 2026-06-17 | deepseek-v4-flash-free | `frontend/src/core/camera.js` | Fix: subir brightRatio 0.10→0.15 y coverage 0.18→0.65 para forzar cartilla más cerca del marco |
| 2026-06-17 | deepseek-v4-flash-free | `frontend/src/main.js` | Fix: leer `token` param como fallback de `sso_token` en URL |
| 2026-06-17 | deepseek-v4-flash-free | `frontend/src/screens/Camera.js` | Fix: recortar captura al ROI de la cartilla (evitar enviar frame completo al backend) |
| 2026-06-17 | deepseek-v4-flash-free | `frontend/src/screens/Camera.js` | Fix: remover gate canCapture — el tap siempre captura, indicador verde/rojo es solo guía |
| 2026-06-17 | deepseek-v4-flash-free | `frontend/src/core/camera.js` | Fix: revertir coverage mínimo a 0.18 (era 0.30, ahora es informativo) |
| 2026-06-14 | deepseek-v4-flash-free | `frontend/src/screens/Camera.js` | Marco 0.695 AR (match template 1600:2300), dimensiones responsivas, ROI 3% |
| 2026-06-12 | deepseek-v4-flash-free | `frontend/src/core/camera.js` | Opción B: detección de cruces por bright pixels → 4 corners → dark pixels |
| 2026-06-11 | deepseek-v4-flash-free | `frontend/src/screens/Camera.js` | Tap-to-capture manual, removido auto-capture |
| 2026-06-10 | deepseek-v4-flash-free | `frontend/src/core/camera.js` | Pipeline calibración: nitidez (Laplacian 80), estabilidad (frame diff 0.15), 5 frames consecutivos |
| 2026-06-09 | deepseek-v4-flash-free | `frontend/vite.config.js` | Agregado proxy Vite `/api` → `localhost:8000` para dev local |
| 2026-06-09 | deepseek-v4-flash-free | `frontend/.env` | `VITE_API_URL=/api/v1` (relativo, funciona en VPS y local) |
