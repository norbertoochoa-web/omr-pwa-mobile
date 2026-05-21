#!/bin/bash
echo "=== Configuración de Git y GitHub ==="
echo ""

# Verificar si git está instalado
if ! command -v git &> /dev/null; then
    echo "Git no está instalado. Instálalo con:"
    echo "  sudo apt update && sudo apt install git -y"
    echo ""
    echo "Luego ejecuta este script de nuevo."
    exit 1
fi

# Configurar git
git config --global user.name "Norberto Ochoa"
git config --global user.email "norberto.ochoa@gmail.com"

echo "Git configurado para: norberto.ochoa@gmail.com"
echo ""

# Crear .gitignore
cat > .gitignore << 'EOF'
node_modules/
dist/
.env
*.log
.DS_Store
package-lock.json
EOF

echo ".gitignore creado"
echo ""

# Inicializar repositorio
git init
git add -A
git commit -m "Fase 1: OMR PWA Mobile - Initial commit

- Vite + Vanilla JS + TailwindCSS + Dexie.js
- Mock API con Express (5 endpoints)
- Camera module con calibración Laplacian
- Cola offline con IndexedDB
- PWA configuration
- Responsive layout
- Fallback a galería cuando cámara no disponible"

echo ""
echo "Commit creado exitosamente!"
echo ""
echo "Ahora crea un repositorio en GitHub:"
echo "1. Ve a https://github.com/new"
echo "2. Nombre: omr-pwa-mobile"
echo "3. Público o Privado (tu elección)"
echo "4. NO marques 'Initialize with README'"
echo "5. Crea el repositorio"
echo ""
echo "Luego ejecuta:"
echo "git remote add origin https://github.com/norberto-ochoa/omr-pwa-mobile.git"
echo "git branch -M main"
echo "git push -u origin main"
echo ""
