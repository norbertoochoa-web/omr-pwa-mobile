#!/bin/bash
echo "=== OMR PWA - Iniciando servidores ==="
echo ""

BASE_DIR="$(cd "$(dirname "$0")" && pwd)"
MY_IP=$(hostname -I | awk '{print $1}')

echo "Tu IP local es: $MY_IP"
echo ""

# Kill any existing processes on ports 3001 and 5173
echo "Limpiando puertos..."
fuser -k 3001/tcp 2>/dev/null
fuser -k 5173/tcp 2>/dev/null
sleep 1

if command -v ufw &> /dev/null; then
    echo "Abriendo puertos en firewall..."
    sudo ufw allow 3001/tcp 2>/dev/null
    sudo ufw allow 5173/tcp 2>/dev/null
fi

echo "Iniciando Mock API (Puerto 3001)..."
cd "$BASE_DIR/mock-api" && npm run dev &
API_PID=$!

sleep 2

echo "Iniciando Frontend (Puerto 5173)..."
cd "$BASE_DIR/frontend" && npm run dev -- --host &
FRONT_PID=$!

echo ""
echo "========================================="
echo "Servidores corriendo!"
echo "========================================="
echo ""
echo "Desde tu celular abre (acepta certificado autofirmado):"
echo "https://$MY_IP:5173/?api_url=http://$MY_IP:3001/api/v1"
echo ""
echo "O prueba la API directamente:"
echo "http://$MY_IP:3001/api/v1/health"
echo ""
echo "Presiona Ctrl+C para detener todo"
echo ""

trap "kill $API_PID $FRONT_PID 2>/dev/null; exit" INT TERM
wait
