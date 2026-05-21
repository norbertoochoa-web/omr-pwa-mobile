#!/bin/bash
echo "=== Crear repositorio en GitHub automáticamente ==="
echo ""

# Verificar dependencias
if ! command -v curl &> /dev/null; then
    echo "curl no está instalado"
    exit 1
fi

# Credenciales
GITHUB_USER="norberto-ochoa"
GITHUB_EMAIL="norberto.ochoa@gmail.com"
GITHUB_PASS="Gaaspi_Agustina1"
REPO_NAME="omr-pwa-mobile"

echo "Creando repositorio: $REPO_NAME"
echo ""

# Crear repositorio vía API
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" \
  -u "$GITHUB_EMAIL:$GITHUB_PASS" \
  -X POST \
  https://api.github.com/user/repos \
  -d "{\"name\":\"$REPO_NAME\",\"description\":\"OMR PWA Mobile - Captura de cartillas OMR\",\"private\":false}")

if [ "$RESPONSE" = "201" ]; then
    echo "✅ Repositorio creado exitosamente!"
    echo ""
    echo "Subiendo código..."
    
    git remote add origin https://github.com/$GITHUB_USER/$REPO_NAME.git
    git branch -M main
    git push -u origin main
    
    echo ""
    echo "✅ Código subido a GitHub!"
    echo "URL: https://github.com/$GITHUB_USER/$REPO_NAME"
else
    echo "❌ Error al crear repositorio (HTTP $RESPONSE)"
    echo ""
    echo "Crea el repositorio manualmente:"
    echo "1. Ve a https://github.com/new"
    echo "2. Nombre: $REPO_NAME"
    echo "3. Desmarca 'Initialize with README'"
    echo "4. Luego ejecuta:"
    echo "   git remote add origin https://github.com/$GITHUB_USER/$REPO_NAME.git"
    echo "   git branch -M main"
    echo "   git push -u origin main"
fi
