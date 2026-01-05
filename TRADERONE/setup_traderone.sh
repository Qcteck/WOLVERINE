#!/bin/bash
# 🔹 Installer TraderOne + Dashboard + Telegram Bot sur VPS
# 🔹 Auto-crash/reinstall prêt à l'emploi

BASE="/opt/traderone-opt"
mkdir -p $BASE/dashboard
cd $BASE || exit

echo "🧠 Mise à jour NPM & Node"
apt update && apt install -y nodejs npm git

# Installer dépendances JS
npm init -y

# Créer wallet.json si inexistant
if [ ! -f "$BASE/wallet.json" ]; then
cat <<EOF > wallet.json
{
  "PUBLIC_KEY": "",
  "PRIVATE_KEY": ""
}
EOF
fi

# -------------------------------
# TraderOne main.cjs minimal
# -------------------------------
cat <<'EOM' > main.cjs
import fs from "fs";
import readline from "readline";
import bs58 from "bs58";

const walletData = JSON.parse(fs.readFileSync("./wallet.json"));
const PUBLIC_KEY = walletData.PUBLIC_KEY;
const PRIVATE_KEY = walletData.PRIVATE_KEY;

if (!PUBLIC_KEY || !PRIVATE_KEY) {
  console.log("❌ Clé publique ou privée manquante. Sortie.");
  process.exit(1);
}

const wallet = Keypair.fromSecretKey(bs58.decode(PRIVATE_KEY));
const connection = new Connection("https://api.mainnet-beta.solana.com", "confirmed");

console.log("🔑 Clé publique utilisée:", wallet.publicKey.toBase58());

// Simule lecture de solde USDC
const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2q8h5L8c7mY1v5d6D9r8Yk9Z6");

async function main() {
    try {
        const accounts = await connection.getTokenAccountsByOwner(wallet.publicKey, { mint: USDC_MINT });
        const balance = accounts.value.reduce(
            (sum, acc) => sum + parseInt(acc.account.data.parsed.info.tokenAmount.amount),
            0
        );
        console.log("💰 Solde USDC:", balance / 1e6);
    } catch(err) {
        console.log("❌ Erreur récupération solde:", err.message);
    }
}

main();
EOM

# -------------------------------
# Telegram bot minimal
# -------------------------------
cat <<'EOM' > traderone-telegram.js
import fs from "fs";
import TelegramBot from "node-telegram-bot-api";

const TOKEN = "TON_BOT_TOKEN";
const CHAT_ID = 123456789; // mettre ton chat_id réel

const bot = new TelegramBot(TOKEN, { polling: false });

function sendLog(message) {
  bot.sendMessage(CHAT_ID, message);
}

setInterval(() => {
  const log = fs.readFileSync('./traderone.log','utf8');
  sendLog("📄 Log TraderOne:\n" + log.split('\n').slice(-5).join('\n'));
}, 10000);

console.log("🤖 Telegram Bot en ligne");
EOM

# -------------------------------
# Dashboard simple
# -------------------------------
cat <<'EOM' > dashboard/index.html
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>TraderOne Dashboard</title>
<style>
body{background:#020617;color:#e5e7eb;font-family:sans-serif;padding:20px}
h1{color:#38bdf8}
pre{background:#111;padding:10px;border-radius:5px;overflow:auto}
</style>
</head>
<body>
<h1>TraderOne Dashboard</h1>
<pre id="logs">Logs seront affichés ici...</pre>
<script>
async function fetchLogs(){
  const resp = await fetch('/logs.txt');
  document.getElementById('logs').innerText = await resp.text();
}
setInterval(fetchLogs,3000);
fetchLogs();
</script>
</body>
</html>
EOM

# -------------------------------
# Créer service systemd
# -------------------------------
cat <<EOM > /etc/systemd/system/traderone.service
[Unit]
Description=TraderOne Phantom Bot
After=network.target

[Service]
Type=simple
WorkingDirectory=$BASE
ExecStart=/usr/bin/node $BASE/main.cjs
Restart=always
RestartSec=5
StandardOutput=file:$BASE/traderone.log
StandardError=file:$BASE/traderone.log

[Install]
WantedBy=multi-user.target
EOM

systemctl daemon-reload
systemctl enable traderone.service
systemctl start traderone.service

echo "✅ TraderOne installé et lancé"
echo "📡 Dashboard: $BASE/dashboard"
echo "🤖 Telegram bot: $BASE/traderone-telegram.js (à éditer avec TOKEN et CHAT_ID)"
