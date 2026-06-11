#!/bin/bash
set -e

BASE_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== OMR PWA - Túneles ngrok para testers ==="
echo ""

# Cleanup on exit
cleanup() {
  echo ""
  echo "Deteniendo servidores..."
  kill $API_PID $FRONT_PID 2>/dev/null || true
  pkill ngrok 2>/dev/null || true
  wait $API_PID $FRONT_PID 2>/dev/null || true
  echo "Detenido."
}
trap cleanup EXIT INT TERM

# Kill old processes
pkill ngrok 2>/dev/null || true
fuser -k 3001/tcp 2>/dev/null || true
fuser -k 5173/tcp 2>/dev/null || true
sleep 1

# Start mock API
echo "Iniciando Mock API (Puerto 3001)..."
cd "$BASE_DIR/mock-api" && node index.js &
API_PID=$!
sleep 2

# Start frontend (HTTPS)
echo "Iniciando Frontend (Puerto 5173, HTTPS)..."
cd "$BASE_DIR/frontend" && npm run dev &
FRONT_PID=$!
sleep 5

# Start ngrok with a single config that has both tunnels
echo "Iniciando túneles ngrok..."
cat > /tmp/ngrok_omr.yml << 'YAML'
version: "3"
agent:
  web_addr: "127.0.0.1:4040"
tunnels:
  frontend:
    proto: http
    addr: 5173
  api:
    proto: http
    addr: 3001
YAML

ngrok start --config /tmp/ngrok_omr.yml --log=stdout frontend api > /tmp/ngrok_omr.log 2>&1 &
NGROK_PID=$!
sleep 5

# Extract URLs from ngrok API
FRONTEND_URL=""
API_URL=""
for i in $(seq 1 10); do
  data=$(curl -s http://127.0.0.1:4040/api/tunnels 2>/dev/null || echo "")
  if [ -n "$data" ]; then
    FRONTEND_URL=$(echo "$data" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    for t in d.get('tunnels', []):
        if '5173' in t.get('config', {}).get('addr', ''):
            print(t['public_url'])
except: pass
" 2>/dev/null)
    API_URL=$(echo "$data" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    for t in d.get('tunnels', []):
        if '3001' in t.get('config', {}).get('addr', ''):
            print(t['public_url'])
except: pass
" 2>/dev/null)
    [ -n "$FRONTEND_URL" ] && [ -n "$API_URL" ] && break
  fi
  sleep 2
done

if [ -z "$FRONTEND_URL" ] || [ -z "$API_URL" ]; then
  echo "ERROR: No se pudieron obtener las URLs de ngrok"
  echo "Logs:"
  tail -5 /tmp/ngrok_omr.log
  exit 1
fi

FULL_URL="${FRONTEND_URL}/?api_url=${API_URL}/api/v1"

echo ""
echo "============================================"
echo "  🚀 APP DISPONIBLE PARA TESTERS"
echo "============================================"
echo ""
echo "  FRONTEND:  $FRONTEND_URL"
echo "  API Mock:  ${API_URL}/api/v1"
echo ""
echo "  LINK COMPLETO:"
echo "  $FULL_URL"
echo ""

# Show QR code in terminal
if command -v python3 &>/dev/null; then
  echo "  ESCANEA ESTE QR DESDE TU CELULAR:"
  echo ""
  python3 -c "
import sys
try:
    import qrcode
    qr = qrcode.QRCode(border=2, box_size=2)
    qr.add_data(sys.argv[1])
    qr.print_ascii(tty=True)
except ImportError:
    print('  (instala qrcode: pip install qrcode[pil])')
    print(f'  Abre: {sys.argv[1]}')
" "$FULL_URL" 2>/dev/null || echo "  Abre: $FULL_URL"
  echo ""
fi

echo "============================================"
echo "Credenciales: admin@test.com / password123"
echo "============================================"
echo ""
echo "Presiona Ctrl+C para detener todo"
echo ""

wait
