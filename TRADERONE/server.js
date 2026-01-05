const TRADERONE_DEPOSIT_KEYFILE = process.env.TRADERONE_DEPOSIT_KEYFILE || "/opt/traderone-opt/keys/traderone_deposit.json";
const USDC_MINT = process.env.USDC_MINT || "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
'use strict';

const express = require('express');
const http = require('http');
const path = require('path');

const { WebSocketServer } = require('ws');

const app = express();

/* WOLVERINE_BALANCES_CACHE_BEGIN */
// Simple in-memory cache to avoid RPC 429
const __balCache = new Map(); // key -> {ts, data, code, headers}
const __balTTLms = Number(process.env.BALANCES_CACHE_TTL_MS || "5000"); // 5s

function __cacheGet(key){
  const it = __balCache.get(key);
  if (!it) return null;
  if (Date.now() - it.ts > __balTTLms) { __balCache.delete(key); return null; }
  return it;
}
function __cacheSet(key, payload){
  __balCache.set(key, { ts: Date.now(), ...payload });
}
/* WOLVERINE_BALANCES_CACHE_END */


app.use(express.json());



/* WOLVERINE_START_ROUTE_BEGIN */
const BOT_WALLET = process.env.TRADERONE_BOT_WALLET;
const MIN_SOL_FEES = Number(process.env.TRADERONE_MIN_SOL_FEES || "0.01");

// Valide que le BOT a assez de SOL (fees) + assez de USDC vs budget demandé
app.post("/wolverine/traderone/api/start", async (req, res) => {
  try {
    const { wallet, budget } = req.body || {};
    const b = Number(budget);

    if (!wallet || typeof wallet !== "string") return res.status(400).json({ ok:false, error:"bad_wallet" });
    if (!isFinite(b) || b <= 0) return res.status(400).json({ ok:false, error:"bad_budget" });
    if (!BOT_WALLET) return res.status(500).json({ ok:false, error:"bot_wallet_not_set" });

    // call balances2 for BOT
    const http = require("http");
    const url = "http://127.0.0.1:8585/wolverine/traderone/api/balances2?wallet=" + encodeURIComponent(BOT_WALLET);

    const raw = await new Promise((resolve, reject) => {
      http.get(url, (r) => {
        let buf = "";
        r.on("data", (c) => buf += c);
        r.on("end", () => resolve({ code: r.statusCode || 0, body: buf }));
      }).on("error", reject);
    });

    if (raw.code < 200 || raw.code >= 300) {
      return res.status(502).json({ ok:false, error:"balances2_failed", detail:String(raw.body).slice(0,200) });
    }

    let j;
    try { j = JSON.parse(raw.body); } catch(e) {
      return res.status(502).json({ ok:false, error:"balances2_bad_json", detail:String(raw.body).slice(0,120) });
    }

    // your balances2 schema: { user:{sol,usdc,...}, trader:{...} }
    const botSol  = Number(j?.user?.sol  ?? 0);
    const botUsdc = Number(j?.user?.usdc ?? 0);

    if (botSol < MIN_SOL_FEES) return res.status(400).json({ ok:false, error:"bot_needs_sol_fees", botSol, min: MIN_SOL_FEES });
    if (botUsdc < b) return res.status(400).json({ ok:false, error:"insufficient_usdc_on_bot", botUsdc, needed: b });

    return res.json({ ok:true, wallet, budget:b, botSol, botUsdc, msg:"start validated" });
  } catch (e) {
    return res.status(500).json({ ok:false, error:"start_failed", detail:String(e?.message || e) });
  }
});
/* WOLVERINE_START_ROUTE_END */




/* WOLVERINE_FORCE_ROUTE_BEGIN */
// Force /wolverine/traderone/api/balances2 to return same JSON as /api/balances2
app.get("/wolverine/traderone/api/balances2", (req, res) => {
  const http = require("http");
  const q = (req._parsedUrl && req._parsedUrl.search) ? req._parsedUrl.search : "";
  const opts = { hostname: "127.0.0.1", port: 8585, path: "/api/balances2" + q, method: "GET" };

  const r = http.request(opts, (p) => {
    res.statusCode = p.statusCode || 502;
    // copie headers utiles
    Object.entries(p.headers || {}).forEach(([k,v]) => { if (v !== undefined) res.setHeader(k, v); });
    p.pipe(res);
  });

  r.on("error", (e) => res.status(502).json({ ok:false, error:"proxy_failed", detail:String(e && e.message || e) }));
  r.end();
});
/* WOLVERINE_FORCE_ROUTE_END */

/* WOLVERINE_MAP_BEGIN */
// Map /wolverine/traderone/api/* -> /api/* (must be BEFORE routes)
app.use("/wolverine/traderone/api", (req, res, next) => {
  // req.url here is "/balances2?wallet=..." etc.
  req.url = "/api" + req.url;
  next();
});
/* WOLVERINE_MAP_END */

require("./proxy-traderone")(app);
app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));


// WOLVERINE_REWRITE_BEGIN
app.use("/wolverine/traderone/api", (req, res, next) => {
  // ici req.url = "/balances2?wallet=..." => on préfixe /api
  req.url = "/api" + req.url;
  next();
});
// WOLVERINE_REWRITE_END
// ===== Static front (public/) =====
const PUBLIC_DIR = path.join(__dirname, 'public');
app.use('/', express.static(PUBLIC_DIR, { maxAge: '1h', etag: true }));

// ===== API =====
app.get('/health', (req, res) => res.status(200).send('ok'));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'traderone', ts: new Date().toISOString() });
});

app.get('/api/status', (req, res) => {
  res.json({
    ok: true,
    mode: process.env.MODE || 'paper',
    network: process.env.NETWORK || 'solana',
    ts: new Date().toISOString()
  });
});

// Stubs (remplace par tes vraies fonctions)
app.post('/api/start', (req, res) => res.json({ ok: true, started: true, params: req.body || {} }));
app.post('/api/stop',  (req, res) => res.json({ ok: true, stopped: true }));
app.post('/api/swap',  (req, res) => res.json({ ok: true, simulated: true, request: req.body || {} }));

// SPA fallback
app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));

const HOST = process.env.HOST || '127.0.0.1';
const PORT = parseInt(process.env.PORT || '8585', 10);

const server = http.createServer(app);

// ===== WebSocket (optionnel) =====
const wss = new WebSocketServer({ server, path: '/ws' });
wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'hello', ts: new Date().toISOString() }));
  ws.on('message', (msg) => {
    ws.send(JSON.stringify({ type: 'echo', msg: msg.toString() }));
  });
});



/* WOLVERINE_RPC_PROXY_V1 */
app.post("/wolverine/traderone/api/rpc", async (req,res) => {
  try{
    const upstream = "https://api.mainnet-beta.solana.com";
    const r = await fetch(upstream, {
      method: "POST",
      headers: {"content-type":"application/json"},
      body: JSON.stringify(req.body || {})
    });
    const txt = await r.text();
    res.status(r.status);
    res.setHeader("content-type","application/json");
    res.send(txt);
  }catch(e){
    res.status(500).json({error: String(e?.message||e)});
  }
});
/* /WOLVERINE_RPC_PROXY_V1 */

server.listen(PORT, HOST, () => {
  console.log(`[TraderOne] listening on http://${HOST}:${PORT}`);
});


// ===== WOLVERINE_BALANCES_API (server-side RPC, avoids browser CORS/403) =====
const SOLANA_RPCS = [
  "https://api.mainnet-beta.solana.com",
  "https://solana-mainnet.g.alchemy.com/v2/demo",
];

async function solanaRpc(method, params) {
  let lastErr = null;
  for (const url of SOLANA_RPCS) {
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || data.error) throw new Error((data.error && data.error.message) || ("HTTP " + r.status));
      return data.result;
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error("RPC failed");
}

// GET /api/balances?wallet=PUBLICKEY
app.get("/api/balances", async (req, res) => {
  try {
    const wallet = String(req.query.wallet || "").trim();
    if (!wallet) return res.status(400).json({ error: "missing wallet" });

    const solRes = await solanaRpc("getBalance", [wallet]);
    const sol = (solRes && solRes.value ? (solRes.value / 1_000_000_000) : 0);

    const usdcMint = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
    const tokRes = await solanaRpc("getTokenAccountsByOwner", [
      wallet,
      { mint: usdcMint },
      { encoding: "jsonParsed" }
    ]);

    let usdc = 0;
    const v = (tokRes && tokRes.value) || [];
    if (v.length) {
      usdc = v[0]?.account?.data?.parsed?.info?.tokenAmount?.uiAmount ?? 0;
    }

    res.json({ wallet, sol, usdc });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
});
// ===== /WOLVERINE_BALANCES_API =====


/* WOLVERINE_BALANCES2_BEGIN */
(function(){
  try {
    // expose constants if not already defined globally
    const USDC_MINT_LOCAL = process.env.USDC_MINT || "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
    const TRADERONE_DEPOSIT_KEYFILE_LOCAL = process.env.TRADERONE_DEPOSIT_KEYFILE || "/opt/traderone-opt/keys/traderone_deposit.json";

    const fs = require("fs");
    const { PublicKey, Keypair } = require("@solana/web3.js");

/* WOLVERINE_CONN_BEGIN */
let solanaWeb3;
try { solanaWeb3 = require("@solana/web3.js"); } catch(e) { solanaWeb3 = null; }
const SOLANA_RPC = process.env.SOLANA_RPC || (solanaWeb3?.clusterApiUrl ? solanaWeb3.clusterApiUrl("mainnet-beta") : "https://api.mainnet-beta.solana.com");
const connection = solanaWeb3 ? new solanaWeb3.Connection(SOLANA_RPC, "confirmed") : null;
/* WOLVERINE_CONN_END */


    function loadTraderOneKeypair() {
      const secret = Uint8Array.from(JSON.parse(fs.readFileSync(TRADERONE_DEPOSIT_KEYFILE_LOCAL, "utf8")));
      return Keypair.fromSecretKey(secret);
    }

    async function getUsdcSum(ownerPk) {
      const tokRes = await connection.getParsedTokenAccountsByOwner(
        ownerPk,
        { mint: new PublicKey(USDC_MINT_LOCAL) },
        "confirmed"
      );
      let usdc = 0;
      for (const a of (tokRes.value || [])) {
        const ui = a?.account?.data?.parsed?.info?.tokenAmount?.uiAmount;
        const amtStr = a?.account?.data?.parsed?.info?.tokenAmount?.amount;
        const dec = a?.account?.data?.parsed?.info?.tokenAmount?.decimals ?? 6;
        if (ui !== null && ui !== undefined) usdc += Number(ui) || 0;
        else if (amtStr) usdc += (Number(amtStr) || 0) / (10 ** dec);
      }
      return { usdc, accounts: (tokRes.value || []).length };
    }

    // IMPORTANT: app + connection must already exist in your server.js
    
/* WOLVERINE_ALIAS_BALANCES2_BEGIN */
app.get("/wolverine/traderone/api/balances2", (req, res, next) => {
  // forward to the same handler as /api/balances2 by rewriting url + calling next()
  req.url = "/api/balances2" + (req._parsedUrl?.search || "");
  next();
});
/* WOLVERINE_ALIAS_BALANCES2_END */

app.get("/api/balances2", async (req, res) => {
  // WOLVERINE_BALANCES_CACHE_WRAP
  const __origJson = res.json.bind(res);
  const __origSend = res.send.bind(res);
  const __w = String(req.query.wallet || "");
  const __key = "/api/balances2::" + __w;
  res.json = (obj) => { try { __cacheSet(__key, { code: res.statusCode || 200, data: JSON.stringify(obj), headers: {"Content-Type":"application/json"} }); } catch(e) {} return __origJson(obj); };
  res.send = (body) => { try { __cacheSet(__key, { code: res.statusCode || 200, data: body, headers: {"Content-Type": res.getHeader("Content-Type")} }); } catch(e) {} return __origSend(body); };

  // WOLVERINE_BALANCES_CACHE_HIT
  try {
    const w = String(req.query.wallet || "");
    const key = "/api/balances2::" + w;
    const hit = __cacheGet(key);
    if (hit) {
      res.setHeader("X-Cache", "HIT");
      if (hit.headers) Object.entries(hit.headers).forEach(([k,v])=>{ if(v!==undefined) res.setHeader(k,v); });
      return res.status(hit.code || 200).send(hit.data);
    }
    res.setHeader("X-Cache", "MISS");
  } catch(e) {}

      try {
        const wallet = (req.query.wallet || "").toString().trim();
        if (!wallet) return res.status(400).json({ error: "wallet missing" });

        const userPk = new PublicKey(wallet);
        const traderKp = loadTraderOneKeypair();
        const traderPk = traderKp.publicKey;

        const [userLam, traderLam] = await Promise.all([
          connection.getBalance(userPk, "confirmed"),
          connection.getBalance(traderPk, "confirmed"),
        ]);

        const [userU, traderU] = await Promise.all([
          getUsdcSum(userPk),
          getUsdcSum(traderPk),
        ]);

        return res.json({
          user:   { sol: userLam / 1e9,   usdc: userU.usdc,   usdcAccounts: userU.accounts },
          trader: { sol: traderLam / 1e9, usdc: traderU.usdc, usdcAccounts: traderU.accounts },
          traderWallet: traderPk.toBase58(),
          usdcMint: USDC_MINT_LOCAL
        });
      } catch (e) {
        return res.status(500).json({ error: e?.message || String(e) });
      }
    });

    console.log("[WOLVERINE] balances2 route ready");
  } catch (e) {
    console.log("[WOLVERINE] balances2 init error:", e?.message || String(e));
  }
})();
/* WOLVERINE_BALANCES2_END */



