#!/bin/bash
set -e

# -------------------------------
# Variables à modifier si besoin
# -------------------------------
DASHBOARD_DIR="/opt/traderone-opt/dashboard"
NGINX_SITES_AVAILABLE="/etc/nginx/sites-available"
NGINX_SITES_ENABLED="/etc/nginx/sites-enabled"
SITE_NAME="traderone-dashboard"
SERVER_NAME="72.61.79.12"  # Remplace par ton domaine si tu en as un
LOG_DIR="/opt/traderone-opt/logs"

# -------------------------------
# Préparation des dossiers
# -------------------------------
echo "📁 Création des dossiers..."
mkdir -p "$DASHBOARD_DIR"
mkdir -p "$LOG_DIR"

# -------------------------------
# Installation Nginx et outils
# -------------------------------
echo "💻 Installation Nginx et certbot..."
apt update
apt install -y nginx curl certbot python3-certbot-nginx

# -------------------------------
# Création fichier index simple
# -------------------------------
echo "🌐 Création d'un dashboard simple..."
cat > "$DASHBOARD_DIR/index.html" <<EOL
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>TraderOne Dashboard</title>
<style>
body { font-family: Arial; background: #020617; color: #e5e7eb; padding: 20px; }
h1 { color: #38bdf8; }
pre { background: #111827; padding: 10px; overflow-x: auto; }
</style>
</head>
<body>
<h1>📊 TraderOne Dashboard</h1>
<p>Logs récents :</p>
<pre id="logs">Chargement...</pre>
<script>
async function loadLogs() {
  const resp = await fetch('logs.txt');
  document.getElementById('logs').textContent = await resp.text();
}
setInterval(loadLogs, 5000);
loadLogs();
</script>
</body>
</html>
EOL

# Fichier de logs pour le dashboard
touch "$DASHBOARD_DIR/logs.txt"

# -------------------------------
# Configuration Nginx
# -------------------------------
echo "⚙️ Configuration Nginx..."
NGINX_CONF="$NGINX_SITES_AVAILABLE/$SITE_NAME"
cat > "$NGINX_CONF" <<EOL
server {
    listen 80;
    server_name $SERVER_NAME;

    root $DASHBOARD_DIR;
    index index.html;

    location / {
        try_files \$uri \$uri/ =404;
    }

    location /logs.txt {
        alias $LOG_DIR/traderone.log;
    }
}
EOL

# Activer le site
ln -sf "$NGINX_CONF" "$NGINX_SITES_ENABLED/"

# Tester et recharger Nginx
nginx -t
systemctl reload nginx

# -------------------------------
# Message final
# -------------------------------
echo "✅ Dashboard Web installé"
echo "🌐 Accède-le sur : http://$SERVER_NAME"
echo "🔒 Quand tu auras un domaine, tu pourras générer un certificat HTTPS avec certbot"
