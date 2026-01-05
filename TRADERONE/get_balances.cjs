const { getQuote } = require("@jup-ag/api");
const fs = require("fs-extra");
const readline = require("readline-sync");

console.log("[SETUP] Entrez vos clés Phantom (Solana)");

const solPub = readline.question("Clé publique Solana: ");
const solPriv = readline.question("Clé privée Solana: ", {hideEchoBack: true});

const jupPub = "JUP_PUBLIC_DEFAULT";

const keys = {
    solana: { pub: solPub, priv: solPriv },
    jupiter: { pub: jupPub }
};

let einsteinEnabled = true;
let antiEinsteinEnabled = true;

function checkCognitiveErrors(tx) {
    if (!einsteinEnabled) return false;
    if (tx.amount <= 0 || isNaN(tx.amount)) return true;
    return false;
}

function detectIllusion(tx) {
    if (!antiEinsteinEnabled) return false;
    return tx.symbol === "FAKE" || tx.amount > 1000000;
}

let dryRun = false;
function processTx(tx) {
    if (checkCognitiveErrors(tx) || detectIllusion(tx)) {
        console.log("[WARN] Transaction bloquée:", tx);
        return false;
    }
    if (dryRun) console.log("[DRY-RUN] Tx simulée:", tx);
    else console.log("[EXEC] Tx exécutée:", tx);
    return true;
}

async function main() {
    const connection = new Connection("https://api.mainnet-beta.solana.com", "confirmed");
    console.log("[INFO] Connexion Solana établie");

    const txExample = { symbol: "SOL", amount: 10 };
    processTx(txExample);

    console.log("[INFO] TraderOne prêt. Einstein:", einsteinEnabled, "Anti-Einstein:", antiEinsteinEnabled, "Dry-run:", dryRun);
}

main();
