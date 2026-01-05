const API_START = "/wolverine/traderone/api/start";
const API_BALANCES = "/wolverine/traderone/api/balances";

const btnConnect=document.getElementById("btnConnect");
const btnStart=document.getElementById("btnStart");
const btnRefresh=document.getElementById("btnRefresh");
const afterConnect=document.getElementById("afterConnect");
const walletPill=document.getElementById("walletPill");
const solBalEl=document.getElementById("solBal");
const usdcBalEl=document.getElementById("usdcBal");
const budgetEl=document.getElementById("budget");
const statusText=document.getElementById("statusText");

let pubkey=null;

function shortPk(pk){ const s=pk.toString(); return s.slice(0,4)+"…"+s.slice(-4); }
function setStatus(t,cls="muted"){ statusText.className=cls; statusText.textContent=t; }
function canStart(){ const v=Number(budgetEl.value); return pubkey && Number.isFinite(v) && v>0; }

async function refreshBalances(){
  if(!pubkey) return;
  setStatus("Lecture des soldes…");
  try{
    const r = await fetch(`${API_BALANCES}?wallet=${encodeURIComponent(pubkey.toString())}`, { cache: "no-store" });
    const data = await r.json().catch(()=> ({}));
    if(!r.ok) throw new Error(data?.error || ("HTTP "+r.status));
    solBalEl.textContent = Number(data.sol ?? 0).toFixed(6);
    usdcBalEl.textContent = Number(data.usdc ?? 0).toFixed(4);
    setStatus("OK", "ok");
  }catch(e){
    setStatus("Balances error: " + (e?.message || e), "err");
  }
}

btnConnect.onclick=async ()=>{
  if(!window.solana?.isPhantom){
    setStatus("Phantom non détecté","err");
    window.open("https://phantom.app/","_blank");
    return;
  }
  try{
    const r=await window.solana.connect();
    pubkey=r.publicKey;
    walletPill.textContent="Wallet: "+shortPk(pubkey);
    afterConnect.classList.remove("hidden");
    btnConnect.textContent="Wallet connecté";
    btnConnect.disabled=true;
    await refreshBalances();
    btnStart.disabled=!canStart();
  }catch(e){
    setStatus("Connexion refusée: " + (e?.message||e),"err");
  }
};

budgetEl.oninput=()=>{ btnStart.disabled=!canStart(); };
btnRefresh.onclick=refreshBalances;

btnStart.onclick=async ()=>{
  if(!canStart()) return;
  const budget=Number(budgetEl.value);
  setStatus("Démarrage…");
  btnStart.disabled=true;

  try{
    const res=await fetch(API_START,{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({wallet:pubkey.toString(),budget})
    });
    const data=await res.json().catch(()=>({}));
    if(!res.ok){ setStatus(data?.error||"Start failed","err"); btnStart.disabled=false; return; }
    setStatus("WOLVERINE démarré ✅","ok");
  }catch(e){
    setStatus("Erreur API: " + (e?.message||e),"err");
    btnStart.disabled=false;
  }
};
