/* ═══════ SUPABASE CONFIG ═══════ */
const SUPABASE_URL = "https://vrkilanytzftkpfllqjh.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZya2lsYW55dHpmdGtwZmxscWpoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyMzQ5MTUsImV4cCI6MjA5MTgxMDkxNX0.D4BjNIYneCUkbiFnNR8MhsA9-yDYBYNR9Ha2AZemvXk";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* ═══════ STATE & CONFIG ═══════ */
var DEF_P = [
  {name:'Crude Oil', density:0.850, hsn:'2709', other:''},
  {name:'Diesel', density:0.832, hsn:'2710', other:'HSD'},
  {name:'Petrol', density:0.740, hsn:'2710', other:'MS'},
  {name:'Kerosene', density:0.810, hsn:'2710', other:'SKO'},
  {name:'LPG', density:0.510, hsn:'2711', other:''}
];
var DEF_S = {
  products: JSON.parse(JSON.stringify(DEF_P)),
  tanks: [
    {id:'T1', name:'Main Tank 1', capacity: 100000, type: 'Static', location: 'Yard A'},
    {id:'T2', name:'Main Tank 2', capacity: 100000, type: 'Static', location: 'Yard A'},
    {id:'T3', name:'Service Tank', capacity: 20000, type: 'Static', location: 'Yard B'}
  ],
  inventory:[], // Now stores "Batches" assigned to Tanks/Containers
  trades:[
    {id:1,type:'Buy',product:'Diesel',party:'IndianOil Corp',vol:50000,price:91.0,date:'2025-06-20',terms:'Net 30',density:0.832, location: 'T1'},
  ],
  orders:[],
  challans:[],
  suppliers:[],
  buyers:[],
  nextInvId:1, nextTradeId:2, nextOrderNum:1, nextSupId:1, nextBuyId:1, nextChNum:1
};

var state;
var currentTradeDocs = [];
var currentShipDocs = [];
var activeShipDocItem = null;
async function loadState(){
  // Initialize state with default or local first
  try {
    var s = localStorage.getItem('murji_oil_v12');
    var backup = localStorage.getItem('murji_oil_backup_mirror');
    
    state = s ? JSON.parse(s) : (backup ? JSON.parse(backup) : JSON.parse(JSON.stringify(DEF_S)));
    
    // If primary was empty but backup exists, recover automatically
    if (s && JSON.parse(s).trades.length === 0 && backup && JSON.parse(backup).trades.length > 0) {
        state = JSON.parse(backup);
        console.log("RECOVERY: Restored from Safety Mirror.");
    }
  } catch(e) {
    state = JSON.parse(JSON.stringify(DEF_S));
  }

  // Try Cloud Sync (Highest Priority)
  try {
    const { data: auth } = await supabaseClient.auth.getSession();
    if (auth && auth.session) {
      const { data, error } = await supabaseClient
        .from('murji_state')
        .select('state_data')
        .eq('user_id', auth.session.user.id)
        .maybeSingle();
      
      if (data && data.state_data) {
        // Accept cloud state if it has products OR trades (more inclusive)
        const hasData = (data.state_data.trades && data.state_data.trades.length > 0) || 
                        (data.state_data.products && data.state_data.products.length > 0);
        
        if (hasData) {
            state = data.state_data;
            console.log("Cloud Data Accepted: " + (state.trades ? state.trades.length : 0) + " trades found.");
        } else {
            console.warn("Cloud record found but appears empty.");
        }
      }
    }
  } catch (e) {
    console.error("Cloud Load Error:", e);
  }
  
  // ALWAYS run migrations before showing UI
  runMigrations();
  initApp();
}

function runMigrations() {
  if (!state) return;
  // 1. Convert string products to objects
  if (state.products && state.products.length > 0 && typeof state.products[0] === 'string') {
    state.products = state.products.map(function(p) {
      return { name: p, density: (state.densities && state.densities[p]) || 0.850, hsn: '', other: '' };
    });
  }
  
  // 2. Ensure buyers & orders array exists
  if (!state.buyers) state.buyers = [];
  if (!state.orders) state.orders = [];
  if (!state.nextBuyId) state.nextBuyId = 1;
  if (!state.apiKey) state.apiKey = '';
  if (!state.apiModel || state.apiModel.includes('1.5') || state.apiModel === 'gemini-pro') {
    state.apiModel = 'gemini-3.1-flash-lite';
  }
  
  if (document.getElementById('api-key')) document.getElementById('api-key').value = state.apiKey;
  if (document.getElementById('api-model')) document.getElementById('api-model').value = state.apiModel;
  
  // 3. Ensure suppliers have all required fields
  if (state.suppliers) {
    state.suppliers.forEach(function(s) { 
        if (!s.type) s.type = 'local'; 
        if (s.bankName === undefined) s.bankName = '';
        if (s.bankAc === undefined) s.bankAc = '';
        if (s.bankIfsc === undefined) s.bankIfsc = '';
        if (s.bankIban === undefined) s.bankIban = '';
        if (s.bankSwift === undefined) s.bankSwift = '';
        if (s.bankCurr === undefined) s.bankCurr = '';
    });
  }

  // 4. Ensure Tank & Yard structures exist for legacy users
  if (!state.tanks) {
    state.tanks = [
      {id:'T1', name:'Main Tank 1', capacity: 100000, type: 'Static', location: 'Yard A'},
      {id:'T2', name:'Main Tank 2', capacity: 100000, type: 'Static', location: 'Yard A'},
      {id:'T3', name:'Service Tank', capacity: 20000, type: 'Static', location: 'Yard B'}
    ];
  }
  if (!state.inventory) state.inventory = [];

  // 5. Clean up legacy densities map if it exists
  delete state.densities;
  // 6. Fix numeric party IDs (Counterparty display issue)
  if (state.trades) {
    state.trades.forEach(function(t) {
      const isNumeric = typeof t.party === 'number' || (typeof t.party === 'string' && t.party.trim() !== "" && !isNaN(t.party));
      if (isNumeric) {
        const id = parseInt(t.party);
        let found = null;
        if (t.type === 'Buy') found = (state.suppliers || []).find(function(s){ return s.id == id; });
        else if (t.type === 'Sell') found = (state.buyers || []).find(function(b){ return b.id == id; });
        if (found) t.party = found.name;
      }
    });
  }
}

var isTableMissing = false;
async function saveState(force = false){
    if (force) isTableMissing = false;
    if (isTableMissing) return;
    const syncBadge = document.getElementById('sync-status-badge');
    if (syncBadge) {
        syncBadge.textContent = 'SYNCING...';
        syncBadge.style.color = 'var(--gold2)';
    }
    try {
        // 1. Save to Primary Local (Immediate Cache)
        localStorage.setItem('murji_oil_v12', JSON.stringify(state));
        
        // 2. SAFETY MIRROR: Save to a secondary key as a hard backup
        // Only mirror if we actually have data to protect
        if (state.trades && state.trades.length > 5) {
            localStorage.setItem('murji_oil_backup_mirror', JSON.stringify(state));
        }
    } catch(e) {
        const { data: auth } = await supabaseClient.auth.getSession();
        if (!auth.session && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
            alert('CRITICAL: Storage Limit Exceeded!\n\nYour uploaded documents are too large for the browser to save (Max 5MB).\n\nPlease LOGIN to Cloud to use unlimited storage.');
        }
    }

    // Save to Cloud (Background Sync)
    try {
        const { data: auth } = await supabaseClient.auth.getSession();
        if (auth && auth.session) {
            // SYNC GUARD: Check data size (Supabase limit is ~6MB per row)
            const stateSize = JSON.stringify(state).length;
            if (stateSize > 5000000) { // 5MB Warning
                console.error("DATA TOO LARGE: " + (stateSize/1024/1024).toFixed(2) + "MB. Cloud sync might fail.");
                toast("⚠️ DATA TOO LARGE! Remove old document photos to ensure cloud safety.", true);
            }

            const { error } = await supabaseClient
                .from('murji_state')
                .upsert({ 
                    user_id: auth.session.user.id, 
                    state_data: state, 
                    updated_at: new Date() 
                }, { onConflict: 'user_id' });
            
            if (error) {
                if (error.code === 'PGRST116' || error.code === 'PGRST205' || error.status === 404) {
                    console.warn("Table 'murji_state' missing. Cloud sync disabled.");
                    isTableMissing = true;
                    if (syncBadge) {
                        syncBadge.textContent = 'DB SETUP REQUIRED';
                        syncBadge.parentElement.style.borderColor = 'var(--red)';
                        syncBadge.style.color = 'var(--red)';
                    }
                } else {
                    toast('Cloud Sync Failed: ' + error.message, true);
                    if (syncBadge) syncBadge.textContent = 'SYNC ERROR';
                    throw error;
                }
            } else {
                console.log("Synced to Cloud");
                isTableMissing = false;
                if (syncBadge) {
                    syncBadge.textContent = 'CLOUD SYNCED';
                    syncBadge.style.color = 'var(--teal)';
                    syncBadge.parentElement.style.borderColor = 'var(--teal)';
                }
            }
        } else {
            if (syncBadge) syncBadge.textContent = 'LOCAL ONLY';
        }
    } catch(e) {
        console.error('Cloud Sync Error:', e);
        if (syncBadge) syncBadge.textContent = 'SYNC ERROR';
    }
}

function initApp() {
    if (!state) return;
    populateSelects();
    renderProductsList();
    renderTicker();
    renderDashboardKpis();
    renderInvLevels();
    renderRecentTrades();
    renderActiveOrders();
    renderInventoryTable();
    renderTradesTable();
    renderOrdersTable();
    renderChallansTable();
    
    // Yard features with error safety
    try {
        if (typeof renderYardDashboard === 'function') renderYardDashboard();
        if (typeof renderTankManager === 'function') renderTankManager();
    } catch (e) {
        console.warn("Yard Render Error:", e);
    }
}

/* ═══════ YARD MANAGER & TANK LOGIC ═══════ */
function renderYardDashboard() {
    const grid = document.getElementById('yard-grid');
    if (!grid || !state) return;
    
    grid.innerHTML = (state.tanks || []).map(tank => {
        const relevant = (state.inventory || []).filter(i => i.location === tank.id);
        const currentL = relevant.reduce((sum, i) => sum + i.vol, 0);
        const products = [...new Set(relevant.filter(i => i.vol > 0).map(i => i.product))];
        const mainProd = products.length > 0 ? products[0] : 'EMPTY';
        const pct = Math.min(100, Math.max(0, (currentL / tank.capacity) * 100));
        const color = pct > 90 ? '#ef4444' : pct > 75 ? '#f59e0b' : '#14b8a6';
        
        return `
            <div class="panel" style="border-top: 4px solid ${color};">
                <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                    <b>${escH(tank.name)}</b>
                    <span style="color:${color}; font-weight:bold;">${pct.toFixed(1)}%</span>
                </div>
                <div style="background:rgba(255,255,255,0.05); height:80px; position:relative; border-radius:4px; overflow:hidden; border:1px solid var(--border);">
                    <div style="position:absolute; bottom:0; width:100%; height:${pct}%; background:${color}44;"></div>
                    <div style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; flex-direction:column; gap:2px;">
                        <div style="font-size:16px; font-weight:bold;">${fmtN(currentL.toFixed(0))} L</div>
                        <div style="font-size:12px; font-weight:bold; color:var(--teal);">${fmtN((currentL * 0.850).toFixed(1))} KG</div>
                    </div>
                </div>
                <div style="font-size:10px; margin-top:5px; color:var(--muted); display:flex; justify-content:space-between;">
                    <span>${mainProd}</span>
                    <span>${escH(tank.location)}</span>
                </div>
            </div>
        `;
    }).join('');
}

function renderTankManager() {
    const tbody = document.getElementById('tankManagerTable');
    if (!tbody || !state) return;
    
    tbody.innerHTML = (state.tanks || []).map(t => `
        <tr>
            <td class="mono">${t.id}</td>
            <td style="font-weight:bold;">${escH(t.name)}</td>
            <td>${escH(t.location)}</td>
            <td class="mono">${fmtN(t.capacity)} L</td>
            <td><button class="btn btn-sm btn-ghost" onclick="deleteTank('${t.id}')" style="color:var(--red)">&#x2715;</button></td>
        </tr>
    `).join('');
    
    // Update Trade Storage Dropdown
    const locSelect = document.getElementById('tr-storage-loc');
    const srcSelect = document.getElementById('tr-source-loc');
    if (locSelect) {
        let html = '<option value="">-- Direct Sale / Other --</option>';
        (state.tanks || []).forEach(t => {
            html += `<option value="${t.id}">${t.name} (${fmtN(t.capacity)} L)</option>`;
        });
        locSelect.innerHTML = html;
        if (srcSelect) srcSelect.innerHTML = html.replace('-- Direct Sale / Other --', '-- Select Source --');
    }
}

function addTank() {
    if (!state.tanks) state.tanks = [];
    const name = document.getElementById('new-tank-name').value;
    let cap = parseFloat(document.getElementById('new-tank-cap').value);
    const capKG = parseFloat(document.getElementById('new-tank-cap-kg').value);
    const capMT = parseFloat(document.getElementById('new-tank-cap-mt').value);
    const loc = document.getElementById('new-tank-loc').value || 'Main Yard';
    
    if (capKG && !cap) cap = capKG / 0.850;
    if (capMT && !cap) cap = (capMT * 1000) / 0.850;

    if (!name || !cap) return toast('Enter name and capacity', true);
    
    const id = 'T' + (state.tanks.length + 1);
    state.tanks.push({ id, name, capacity: cap, location: loc });
    
    document.getElementById('new-tank-name').value = '';
    document.getElementById('new-tank-cap').value = '';
    document.getElementById('new-tank-cap-kg').value = '';
    document.getElementById('new-tank-cap-mt').value = '';
    
    saveState();
    renderTankManager();
    renderYardDashboard();
    toast('New Tank Registered');
}

function deleteTank(id) {
    if (!confirm('Remove this tank?')) return;
    state.tanks = state.tanks.filter(t => t.id !== id);
    saveState();
    renderTankManager();
    renderYardDashboard();
}

function openLoginModal() { document.getElementById('loginModal').classList.add('show'); }
function closeLoginModal() { document.getElementById('loginModal').classList.remove('show'); }

async function handleLogin() {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    if (!email || !password) return toast('Enter credentials', true);
    
    try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) {
            if (error.message.includes("Email not confirmed")) {
                return toast('Please confirm your email or turn off "Confirm Email" in Supabase settings.', true);
            }
            throw error;
        }
        closeLoginModal();
        toast('Logged in successfully');
    } catch (e) {
        toast(e.message, true);
    }
}

async function handleSignUp() {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    if (!email || !password) return toast('Enter email & password to sign up', true);
    
    try {
        const { error } = await supabaseClient.auth.signUp({ email, password });
        if (error) throw error;
        toast('Sign up successful! Check your email if confirmation is required.');
    } catch (e) {
        toast(e.message, true);
    }
}

async function handleLogout() {
    await supabaseClient.auth.signOut();
    toast('Logged out');
}

function updateAuthState(session) {
    const loginBtn = document.getElementById('btn-login');
    const userInfo = document.getElementById('user-info');
    const emailSpan = document.getElementById('user-email');
    
    if (session && session.user) {
        loginBtn.style.display = 'none';
        userInfo.style.display = 'flex';
        emailSpan.textContent = session.user.email;
    } else {
        loginBtn.style.display = 'block';
        userInfo.style.display = 'none';
    }
}

// Check auth status on load
supabaseClient.auth.onAuthStateChange((event, session) => {
    updateAuthState(session);
    if (event === 'SIGNED_IN') {
        loadState();
    } else if (event === 'SIGNED_OUT') {
        state = JSON.parse(JSON.stringify(DEF_S));
        initApp();
    }
});

loadState();

var fmt=function(n){return'\u20B9'+Number(n).toLocaleString('en-IN',{maximumFractionDigits:2});};
var fmtN=function(n){return Number(n).toLocaleString('en-IN');};
var fmtKG=function(n){return Number(n).toLocaleString('en-IN',{maximumFractionDigits:1});};
var today=function(){return new Date().toISOString().split('T')[0];};
var getDensity = function(pName) {
    if (!state.products) return 0.850;
    var found = state.products.find(function(x) { return x.name === pName; });
    return found ? found.density : 0.850;
};
var toKG=function(v,d){return v*(d||0.85);};
var escH=function(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');};

function dualCalc(prefix, type) {
    const volEl = document.getElementById(prefix + '-qty') || document.getElementById(prefix + '-vol');
    const kgEl = document.getElementById(prefix + '-kg');
    const denEl = document.getElementById(prefix + '-density');
    if (!volEl || !kgEl || !denEl) return;
    const density = parseFloat(denEl.value) || 0.850;

    if (type === 'vol') {
        const vol = parseFloat(volEl.value) || 0;
        kgEl.value = (vol * density).toFixed(1);
    } else {
        const kg = parseFloat(kgEl.value) || 0;
        volEl.value = (kg / density).toFixed(0);
    }
}

function priceCalc(prefix, type) {
    const pL = document.getElementById(prefix + '-price');
    const pKG = document.getElementById(prefix + '-price-kg');
    const denEl = document.getElementById(prefix + '-density');
    if (!pL || !pKG || !denEl) return;
    const density = parseFloat(denEl.value) || 0.850;

    if (type === 'perL') {
        const val = parseFloat(pL.value) || 0;
        pKG.value = (val / density).toFixed(2);
    } else {
        const val = parseFloat(pKG.value) || 0;
        pL.value = (val * density).toFixed(2);
    }
}

function onDensityChangeForPrice(prefix) {
    dualCalc(prefix, 'vol');
    priceCalc(prefix, 'perL');
}

/* ═══════ PDF — Pure print approach ═══════ */
/* ═══════ PDF — Robust Mobile Approach ═══════ */
function commonStyle() {
    return `
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <meta name="format-detection" content="telephone=no">
    <style>
    @page { size: A4; margin: 0mm !important; }
    body { background: white; color: black; font-family: 'DM Sans', sans-serif; margin: 0; padding: 0; }
    .doc { padding: 15mm; max-width: 210mm; margin: 0 auto; box-sizing: border-box; }
    .print-header { text-align: center; margin-bottom: 20px; border-bottom: 3px double #1a5c2e; padding-bottom: 16px; }
    .print-header h1 { font-size: 24px; color: #1a5c2e; margin: 0; }
    .print-header p { font-size: 12px; color: #666; margin: 4px 0 0 0; }
    .print-title { text-align: center; font-size: 18px; font-weight: 700; color: #333; margin: 20px 0; padding: 10px; background: #f0f7f0; border-radius: 4px; }
    .print-table { width: 100%; border-collapse: collapse; margin: 15px 0; }
    .print-table td, .print-table th { padding: 8px 12px; border: 1px solid #ccc; font-size: 13px; }
    .print-table th { background: #e8f0e8; font-weight: 600; color: #1a5c2e; text-align: left; width: 40%; }
    .print-footer { margin-top: 40px; display: flex; justify-content: space-between; }
    .sig-block { text-align: center; width: 180px; }
    .sig-line { border-top: 1px solid #333; margin-top: 50px; padding-top: 5px; font-size: 12px; }
    .print-note { text-align: center; margin-top: 30px; font-size: 10px; color: #999; border-top: 1px solid #ddd; padding-top: 10px; }
    
    .previewActions {
        display: flex; gap: 10px; justify-content: center; padding: 20px;
        background: #f8f9fa; border-bottom: 1px solid #ddd; position: sticky; top: 0; z-index: 100;
    }
    .previewActions button {
        padding: 10px 20px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; border: none;
        color: white; font-family: sans-serif;
    }
    @media print {
        .previewActions { display: none !important; }
        body { margin: 0 !important; }
        .doc { padding: 15mm !important; width: 210mm !important; }
    }
    </style>
    `;
}

function previewScript() {
    return `
    <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
    <script>
      function triggerPrint() {
        const oldTitle = document.title;
        document.title = " ";
        window.print();
        setTimeout(() => { document.title = oldTitle; }, 1000);
      }

      async function downloadCleanPDF(event) {
        const btn = event.target;
        const oldText = btn.innerText;
        btn.innerText = "Generating...";
        btn.disabled = true;

        const element = document.querySelector(".doc");
        const opt = {
          margin: 0,
          filename: (document.title || "Challan") + ".pdf",
          image: { type: "jpeg", quality: 1.0 },
          html2canvas: { scale: 4, useCORS: true, logging: false },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" }
        };

        try {
          await html2pdf().from(element).set(opt).save();
        } catch (err) {
          console.error(err);
          alert("Download failed. Please use Browser Print instead.");
        } finally {
          btn.innerText = oldText;
          btn.disabled = false;
        }
      }
    </script>
    `;
}

function openPrintWindow(html, filename) {
    const fullHtml = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>${filename}</title>
        ${commonStyle()}
        ${previewScript()}
    </head>
    <body>
        <div class="previewActions">
            <button onclick="downloadCleanPDF(event)" style="background:#14b8a6">Download Clean PDF</button>
            <button onclick="triggerPrint()" style="background:#555">Browser Print</button>
            <button onclick="window.close()" style="background:#888">Back</button>
        </div>
        <div class="doc">
            ${html}
        </div>
    </body>
    </html>`;

    try {
        const blob = new Blob([fullHtml], { type: "text/html;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const w = window.open(url, "_blank");
        if (!w) alert("Please allow pop-ups for document preview.");
    } catch (e) {
        console.error("Blob Print Error:", e);
        const w = window.open("about:blank", "_blank");
        if (w) {
            w.document.open();
            w.document.write(fullHtml);
            w.document.close();
        }
    }
}

function downloadChallanPDF(id) {
    var c = null;
    for (var i = 0; i < state.challans.length; i++) {
        if (state.challans[i].id === id) { c = state.challans[i]; break; }
    }
    if (!c) return toast('Challan not found', true);

    var typeLabel = c.type === 'in' ? 'INWARD DELIVERY CHALLAN' : 'OUTWARD DELIVERY CHALLAN';

    var html = '' +
    '<div class="print-header">' +
        '<h1>MURJI RAVJI & CO.</h1>' +
        '<p>OIL TRADING & LOGISTICS</p>' +
    '</div>' +
    '<div class="print-title">' + escH(typeLabel) + '</div>' +
    '<table class="print-table">' +
        '<tr><th>Challan No.</th><td>' + escH(c.id) + '</td></tr>' +
        '<tr><th>Date</th><td>' + escH(c.date) + '</td></tr>' +
    '</table>' +
    '<table class="print-table">' +
        '<tr><th>Product</th><td>' + escH(c.product) + '</td></tr>' +
        '<tr><th>Volume</th><td>' + fmtN(c.vol) + ' Litres</td></tr>' +
        '<tr><th>Weight</th><td>' + fmtKG(c.weight) + ' KG</td></tr>' +
        '<tr><th>Density</th><td>' + c.density + ' kg/L</td></tr>' +
    '</table>' +
    '<table class="print-table">' +
        '<tr><th>' + (c.type==='in'?'Received From':'Dispatched From') + '</th><td>' + escH(c.from) + '</td></tr>' +
        '<tr><th>' + (c.type==='in'?'Stored At':'Delivered To') + '</th><td>' + escH(c.to) + '</td></tr>' +
    '</table>' +
    '<table class="print-table">' +
        '<tr><th>Vehicle No.</th><td>' + escH(c.vehicle) + '</td></tr>' +
        '<tr><th>Driver Name</th><td>' + escH(c.driver) + '</td></tr>' +
        '<tr><th>Driver Phone</th><td>' + escH(c.driverPh) + '</td></tr>' +
    '</table>' +
    '<div class="print-footer">' +
        '<div class="sig-block"><div class="sig-line">Authorized Signatory</div></div>' +
        '<div class="sig-block"><div class="sig-line">Receiver Signature</div></div>' +
    '</div>' +
    '<div class="print-note">This is a computer-generated document from Murji Ravji & Co. \u2014 ' + new Date().toLocaleString('en-IN') + '</div>';

    openPrintWindow(html, c.id + '_' + c.product);
}

/* ═══════ EXCEL — Pure Blob approach ═══════ */
function exportInventoryExcel() {
    try {
        var rows = state.inventory.map(function(i) {
            return [
                i.product,
                i.grade || '-',
                i.density,
                i.tank || '-',
                i.vol,
                toKG(i.vol, i.density),
                i.cost,
                i.vol * i.cost,
                i.threshold
            ];
        });

        var html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">';
        html += '<head><meta charset="UTF-8"><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>Inventory</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->';
        html += '<style>td,th{padding:6px 10px;border:1px solid #999;font-size:12px;font-family:Calibri,sans-serif;}th{background:#d4e6b5;font-weight:bold;color:#1a5c2e;}.num{text-align:right;}</style></head><body>';
        html += '<table>';
        html += '<tr><th>Product</th><th>Grade</th><th>Density (kg/L)</th><th>Tank</th><th>Volume (L)</th><th>Weight (KG)</th><th>Cost/L (&#x20B9;)</th><th>Total Value (&#x20B9;)</th><th>Threshold (L)</th></tr>';
        for (var r = 0; r < rows.length; r++) {
            html += '<tr>';
            html += '<td>' + escH(rows[r][0]) + '</td>';
            html += '<td>' + escH(rows[r][1]) + '</td>';
            html += '<td class="num">' + rows[r][2] + '</td>';
            html += '<td>' + escH(rows[r][3]) + '</td>';
            html += '<td class="num">' + fmtN(rows[r][4]) + '</td>';
            html += '<td class="num">' + fmtKG(rows[r][5]) + '</td>';
            html += '<td class="num">' + rows[r][6].toFixed(2) + '</td>';
            html += '<td class="num">' + fmt(rows[r][7]) + '</td>';
            html += '<td class="num">' + fmtN(rows[r][8]) + '</td>';
            html += '</tr>';
        }
        var totalVol = 0, totalVal = 0;
        for (var r = 0; r < rows.length; r++) { totalVol += rows[r][4]; totalVal += rows[r][7]; }
        html += '<tr style="font-weight:bold;background:#eee"><td>TOTAL</td><td></td><td></td><td></td><td class="num">' + fmtN(totalVol) + '</td><td></td><td></td><td class="num">' + fmt(totalVal) + '</td><td></td></tr>';
        html += '</table></body></html>';

        var blob = new Blob([html], {type: 'application/vnd.ms-excel;charset=utf-8'});
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'MurjiRavji_Inventory_' + today() + '.xls';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast('Excel file downloaded');
    } catch (err) {
        console.error('Excel Error:', err);
        toast('Export failed: ' + err.message, true);
    }
}

/* ═══════ WHATSAPP SHARE ═══════ */
function shareWhatsApp(id) {
    var c = null;
    for (var i = 0; i < state.challans.length; i++) {
        if (state.challans[i].id === id) { c = state.challans[i]; break; }
    }
    if (!c) return toast('Challan not found', true);
    var text = '*MURJI RAVJI & CO.*\nChallan: ' + c.id + '\nDate: ' + c.date +
        '\nProduct: ' + c.product + '\nVol: ' + fmtN(c.vol) + ' L\nWeight: ' + fmtKG(c.weight) + ' KG' +
        '\nFrom: ' + (c.from||'-') + '\nTo: ' + (c.to||'-') + '\nVehicle: ' + c.vehicle;
    window.open('https://api.whatsapp.com/send?text=' + encodeURIComponent(text), '_blank');
}

/* ═══════ CORE UI LOGIC ═══════ */
function updateClock() {
    document.getElementById('clockEl').textContent = new Date().toLocaleString('en-IN', {dateStyle:'medium', timeStyle:'short'});
}
updateClock();
setInterval(updateClock, 30000);

var VOL_MAP = {
    inv:{volId:'inv-vol',kgId:'inv-kg',denId:'inv-density'},
    tr:{volId:'tr-vol',kgId:'tr-kg',denId:'tr-density'},
    ord:{volId:'ord-qty',kgId:'ord-kg',denId:'ord-density'},
    ch:{volId:'ch-vol',kgId:'ch-kg',denId:'ch-density'}
};
var PRICE_MAP = {
    inv:{perLId:'inv-cost',perKGId:'inv-cost-kg'},
    tr:{perLId:'tr-price',perKGId:'tr-price-kg'},
    ord:{perLId:'ord-price',perKGId:'ord-price-kg'}
};
var _lk = {};
function dualCalc(px, ch) {
    var m = VOL_MAP[px]; if (_lk[px]) return; _lk[px] = true;
    var d = parseFloat(document.getElementById(m.denId).value) || 0.85;
    var vEl = document.getElementById(m.volId), kEl = document.getElementById(m.kgId);
    if (ch === 'vol') { var v = parseFloat(vEl.value)||0; kEl.value = v>0 ? toKG(v,d).toFixed(1) : ''; }
    else { var kg = parseFloat(kEl.value)||0; vEl.value = kg>0 ? (kg/d).toFixed(1) : ''; }
    setTimeout(function(){ _lk[px] = false; }, 60);
}
function priceCalc(px, ch) {
    var m = PRICE_MAP[px]; if (_lk['p_'+px]) return; _lk['p_'+px] = true;
    var d = parseFloat(document.getElementById(VOL_MAP[px].denId).value) || 0.85;
    var lEl = document.getElementById(m.perLId), kEl = document.getElementById(m.perKGId);
    if (ch === 'perL') { var pl = parseFloat(lEl.value)||0; kEl.value = pl>0 ? (pl*d).toFixed(2) : ''; }
    else { var pkg = parseFloat(kEl.value)||0; lEl.value = pkg>0 ? (pkg/d).toFixed(2) : ''; }
    setTimeout(function(){ _lk['p_'+px] = false; }, 60);
}
function onDensityChangeForPrice(px) { _lk[px] = false; _lk['p_'+px] = false; }
function toggleCustomTerm(px) {
    var sel = document.getElementById(px+'-terms');
    var cust = document.getElementById(px+'-custom-term');
    if (sel.value === '__custom__') cust.classList.add('show');
    else cust.classList.remove('show');
}
function populateTradeParties() {
    var type = document.getElementById('tr-type').value;
    var iWrap = document.getElementById('tr-party-input-wrap');
    var sWrap = document.getElementById('tr-party-select-wrap');
    var sel = document.getElementById('tr-party-select');
    
    if (type === 'Buy') {
        iWrap.style.display = 'none';
        sWrap.style.display = 'block';
        sel.innerHTML = '<option value="">-- Select Supplier --</option>' + 
            state.suppliers.map(function(s){ return '<option>'+escH(s.name)+'</option>'; }).join('');
    } else {
        iWrap.style.display = 'block';
        sWrap.style.display = 'none';
        if (state.buyers && state.buyers.length > 0) {
            iWrap.style.display = 'none';
            sWrap.style.display = 'block';
            sel.innerHTML = '<option value="">-- Select Buyer --</option>' + 
                state.buyers.map(function(b){ return '<option>'+escH(b.name)+'</option>'; }).join('');
        }
    }
}
function calcTradeTotals() {
    var rawQty = parseFloat(document.getElementById('tr-vol').value) || 0;
    var den = parseFloat(document.getElementById('tr-density').value) || 0.85;
    var unit = document.getElementById('tr-unit').value;
    var mode = document.getElementById('tr-mode').value;
    
    var price = 0;
    if (mode === 'import' || mode === 'hs_sale') {
        price = parseFloat(document.getElementById('tr-imp-rate').value) || 0;
        var isHs = document.getElementById('tr-is-hs') ? document.getElementById('tr-is-hs').checked : false;
        if (mode === 'import' && !isHs) {
            var ex = parseFloat(document.getElementById('tr-ex-rate').value) || 0;
            price = price * ex;
        }
    } else {
        price = parseFloat(document.getElementById('tr-price-local').value) || 0;
    }

    // Total INR is always Raw Quantity in box * Price per that unit
    var basicInr = rawQty * price;
    
    // Add Logistics Expenses
    var logRows = document.querySelectorAll('#tr-expenses-body tr');
    var logTotal = 0;
    logRows.forEach(row => {
        const amtEl = row.querySelector('.exp-total');
        const amt = amtEl ? (parseFloat(amtEl.value) || 0) : 0;
        logTotal += amt;
    });
    
    // Add Bank Charges from Payments
    var payRows = document.querySelectorAll('#tr-payments-body tr');
    var bankTotal = 0;
    payRows.forEach(row => {
        const inputs = row.querySelectorAll('input');
        if (inputs && inputs.length > 3) bankTotal += parseFloat(inputs[3].value) || 0;
    });

    // Add Tank/Extra Cost if import (calculated in USD converted to INR)
    var tankCost = 0;
    if (mode === 'import') {
        var contCount = parseFloat(document.getElementById('tr-container-count').value) || 0;
        var tankRateUSD = parseFloat(document.getElementById('tr-tank-rate').value) || 0;
        var ex = parseFloat(document.getElementById('tr-ex-rate').value) || 1;
        tankCost = contCount * tankRateUSD * ex;
        document.getElementById('tr-tank-cost').value = fmtN(tankCost);
    }
    
    var totalInr = basicInr + logTotal + bankTotal + tankCost;
    document.getElementById('tr-total-inr-shared').value = fmt(totalInr);
    
    // Update Foreign Total
    if (mode === 'import' || mode === 'hs_sale') {
        var qtyFor = parseFloat(document.getElementById('tr-vol').value) || 0;
        var rateFor = parseFloat(document.getElementById('tr-imp-rate').value) || 0;
        document.getElementById('tr-total-for').value = (qtyFor * rateFor).toLocaleString('en-US', {minimumFractionDigits:2});
    }
    
    // Toggle High Seas Purchase fields
    var isHS = document.getElementById('tr-is-hs').checked;
    var hsFields = document.getElementById('tr-hs-purchase-fields');
    if (hsFields) hsFields.style.display = isHS ? 'grid' : 'none';
    
    // Update Payment Summary
    updatePaymentSummary();
    
    // Dual Landed Cost calculation
    if (totalInr > 0) {
        var volL = 0;
        if (unit === 'LITRE') volL = rawQty;
        else if (unit === 'KG') volL = rawQty / den;
        else if (unit === 'MTON') volL = (rawQty * 1000) / den;
        
        var volKG = volL * den;
        
        if (volL > 0) document.getElementById('tr-landed-l').value = '\u20B9 ' + (totalInr / volL).toFixed(2);
        if (volKG > 0) document.getElementById('tr-landed-kg').value = '\u20B9 ' + (totalInr / volKG).toFixed(2);
    } else {
        document.getElementById('tr-landed-l').value = '';
        document.getElementById('tr-landed-kg').value = '';
    }
}

function toggleTradeModeField() {
    var type = document.getElementById('tr-type').value;
    var modeGrp = document.getElementById('tr-mode-group');
    var modeSel = document.getElementById('tr-mode');
    
    populateTradeParties();
    
    // Update Mode Options based on Type
    var oldVal = modeSel.value;
    if (type === 'Buy') {
        modeSel.innerHTML = '<option value="local">Local Purchase</option><option value="import">Import Purchase</option>';
    } else {
        modeSel.innerHTML = '<option value="local">Local Sale</option><option value="hs_sale">High Seas Sale</option>';
    }
    // Try to restore value if applicable
    if (modeSel.querySelector('option[value="'+oldVal+'"]')) modeSel.value = oldVal;
    
    modeGrp.style.display = 'flex';
    toggleTradeDetailFields();
}
function toggleTradeDetailFields() {
    var type = document.getElementById('tr-type').value;
    var mode = document.getElementById('tr-mode').value;
    var imp = document.querySelector('.tr-import-fields');
    var loc = document.querySelector('.tr-local-fields');
    var linkGrp = document.getElementById('tr-link-group');
    var srcGrp = document.getElementById('tr-source-loc-group');
    
    if (srcGrp) srcGrp.style.display = (type === 'Move' || (type === 'Sell' && mode === 'local')) ? 'block' : 'none';
    if (srcGrp.style.display === 'block') populateSourceLocations();

    if (type === 'Move') {
        imp.style.display = 'none';
        loc.style.display = 'grid';
        linkGrp.style.display = 'none';
        document.getElementById('tr-payments-section').style.display = 'none';
        return;
    }

    if (type === 'Buy') {
        linkGrp.style.display = 'none';
        if (mode === 'import') {
            imp.style.display = 'grid';
            loc.style.display = 'none';
            document.getElementById('tr-payments-section').style.display = 'block';
            document.getElementById('tr-buyer-payments-section').style.display = 'none';
            calcImportTotal();
        } else {
            imp.style.display = 'none';
            loc.style.display = 'grid';
            document.getElementById('tr-payments-section').style.display = 'none';
            document.getElementById('tr-buyer-payments-section').style.display = 'none';
        }
    } else {
        // Sell
        imp.style.display = 'none';
        loc.style.display = (mode === 'local') ? 'grid' : 'none';
        document.getElementById('tr-payments-section').style.display = 'none';
        document.getElementById('tr-buyer-payments-section').style.display = (mode === 'local') ? 'block' : 'none';
        document.getElementById('tr-deal-group').style.display = 'flex';
        if (mode === 'hs_sale') {
            linkGrp.style.display = 'flex';
            populatePurchaseLinks();
        } else {
            linkGrp.style.display = 'none';
        }
    }
}
function populatePurchaseLinks() {
    var sel = document.getElementById('tr-link-purchase');
    // Find Buy trades that are Import or already tagged as Buy-HS
    var buys = state.trades.filter(function(t){ return t.type === 'Buy' && t.mode === 'import'; });
    
    sel.innerHTML = '<option value="">-- Link to Import Purchase --</option>' + 
        buys.map(function(t){ 
            return '<option value="'+t.id+'">'+escH(t.id+' | '+t.party+' | '+t.product+' ('+t.vol+'L)')+'</option>'; 
        }).join('');
}
function loadPurchaseDetails() {
    var id = parseInt(document.getElementById('tr-link-purchase').value);
    if (!id) return;
    var p = state.trades.find(function(t){ return t.id === id; });
    if (!p) return;
    
    document.getElementById('tr-product').value = p.product;
    document.getElementById('tr-vol').value = p.vol;
    document.getElementById('tr-density').value = p.density;
    calcTradeTotals();
    toast('Loaded details from Purchase ' + id);
}
function calcImportTotal() {
    var isHs = document.getElementById('tr-is-hs').checked;
    var rawQty = parseFloat(document.getElementById('tr-vol').value) || 0;
    var rate = parseFloat(document.getElementById('tr-imp-rate').value) || 0;
    
    var currEl = document.getElementById('tr-imp-curr');
    var exEl = document.getElementById('tr-ex-rate');
    var exGrp = document.getElementById('tr-ex-rate-group');
    var currGrp = document.getElementById('tr-imp-curr-group');

    if (isHs) {
        currEl.value = 'INR';
        exEl.value = '1';
        exGrp.style.display = 'none';
        currGrp.style.display = 'none';
    } else {
        exGrp.style.display = 'flex';
        currGrp.style.display = 'flex';
        if (currEl.value === 'INR') currEl.value = 'USD';
    }

    var totalFor = rawQty * rate;
    var curr = currEl.value;

    document.getElementById('tr-total-for').value = curr + ' ' + totalFor.toLocaleString('en-US', {minimumFractionDigits:2});
    
    if (rawQty > 0) {
        calcTradeTotals();
    }
}

function populateTradeParties() {
    var type = document.getElementById('tr-type').value;
    var selectWrap = document.getElementById('tr-party-select-wrap');
    var inputWrap = document.getElementById('tr-party-input-wrap');
    var sel = document.getElementById('tr-party-select');
    if (!sel || !selectWrap || !inputWrap) return;
    
    if (type === 'Buy') {
        selectWrap.style.display = 'block';
        inputWrap.style.display = 'none';
        sel.innerHTML = '<option value="">-- Select Supplier --</option>' + 
            (state.suppliers||[]).map(function(s){ return '<option value="'+escH(s.name)+'">'+escH(s.name)+'</option>'; }).join('');
    } else if (type === 'Sell') {
        selectWrap.style.display = 'block';
        inputWrap.style.display = 'none';
        sel.innerHTML = '<option value="">-- Select Buyer --</option>' + 
            (state.buyers||[]).map(function(b){ return '<option value="'+escH(b.name)+'">'+escH(b.name)+'</option>'; }).join('');
    } else {
        selectWrap.style.display = 'none';
        inputWrap.style.display = 'block';
    }
}

/* ═══════ RENDER FUNCTIONS ═══════ */
function kpiC(label, val, sub) {
    return '<div class="kpi"><div class="kpi-label">'+label+'</div><div class="kpi-value">'+val+'</div><div class="kpi-change">'+sub+'</div></div>';
}
function statusBadge(s) {
    var m = {'Pending':'badge-gold','Dispatched':'badge-blue','Delivered':'badge-green'};
    return '<span class="badge '+(m[s]||'badge-gray')+'">'+s+'</span>';
}

function renderDashboardKpis() {
    var ts = 0, tv = 0;
    for (var i = 0; i < state.inventory.length; i++) {
        var inv = state.inventory[i];
        ts += inv.vol * inv.cost;
        tv += inv.vol;
    }
    var sl = 0;
    for (var i = 0; i < state.trades.length; i++) {
        var t = state.trades[i];
        var displayQty = t.raw_qty !== undefined ? t.raw_qty : t.vol;
        if (t.type === 'Sell') sl += displayQty * t.price;
    }
    document.getElementById('kpiGrid').innerHTML =
        kpiC('Inventory Value', fmt(ts), 'Total Stock') +
        kpiC('Volume', fmtN(tv) + ' L', 'Litres') +
        kpiC('Sales', fmt(sl), 'Revenue');
}
function renderInvLevels() {
    document.getElementById('invLevels').innerHTML = state.inventory.map(function(i) {
        var p = Math.min(100, Math.round(i.vol / (i.threshold * 10) * 100));
        var c = p > 50 ? 'green' : p > 25 ? '' : 'red';
        return '<div class="progress-wrap"><div class="progress-label"><span>'+i.product+'</span><span class="mono">'+fmtN(i.vol)+' L</span></div><div class="progress"><div class="progress-fill '+c+'" style="width:'+p+'%"></div></div></div>';
    }).join('');
}
function renderRecentTrades() {
    document.getElementById('recentTradesTbl').innerHTML = state.trades.slice(-5).reverse().map(function(t) {
        var displayQty = t.raw_qty !== undefined ? t.raw_qty : t.vol;
        var unitSuffix = t.unit ? ' ' + t.unit : ' L';
        return '<tr><td>'+t.product+'</td><td><span class="badge '+(t.type==='Buy'?'badge-blue':'badge-green')+'">'+t.type+'</span></td><td class="mono">'+fmtN(displayQty)+unitSuffix+'</td><td class="mono">'+fmtKG(toKG(t.vol,t.density))+'</td><td class="mono">'+fmt(t.price)+'</td><td class="mono">'+fmt(displayQty*t.price)+'</td></tr>';
    }).join('');
}
function renderActiveOrders() {
    document.getElementById('activeOrdersTbl').innerHTML = state.orders.filter(function(o){return o.status!=='Delivered';}).map(function(o) {
        return '<tr><td class="mono">'+o.id+'</td><td>'+o.customer+'</td><td>'+o.product+'</td><td class="mono">'+fmtN(o.qty)+'</td><td class="mono">'+fmt(o.qty*o.price)+'</td><td>'+statusBadge(o.status)+'</td><td class="mono">'+o.due+'</td></tr>';
    }).join('');
}

function populateOrderParties() {
    const type = document.getElementById('ord-type').value;
    const sel = document.getElementById('ord-customer');
    if (!sel) return;
    
    if (type === 'PURCHASE') {
        sel.innerHTML = '<option value="">-- Select Supplier --</option>' + 
            (state.suppliers || []).map(s => `<option value="${escH(s.name)}">${escH(s.name)}</option>`).join('');
    } else {
        sel.innerHTML = '<option value="">-- Select Buyer --</option>' + 
            (state.buyers || []).map(b => `<option value="${escH(b.name)}">${escH(b.name)}</option>`).join('');
    }
}

function populateOrderParties() {
    const type = document.getElementById('ord-type').value;
    const sel = document.getElementById('ord-customer');
    if (!sel) return;
    
    if (type === 'PURCHASE') {
        sel.innerHTML = '<option value="">-- Select Supplier --</option>' + 
            (state.suppliers || []).map(s => `<option value="${escH(s.name)}">${escH(s.name)}</option>`).join('');
    } else {
        sel.innerHTML = '<option value="">-- Select Buyer --</option>' + 
            (state.buyers || []).map(b => `<option value="${escH(b.name)}">${escH(b.name)}</option>`).join('');
    }
}

function populateSelects() {
    if (!state || !state.products) return;
    populateOrderParties();
    ['inv-product', 'tr-product', 'ord-product', 'ch-product'].forEach(function(id) {
        var el = document.getElementById(id);
        if (!el) return;
        el.innerHTML = state.products.map(function(p){ 
            var label = p.name + (p.other ? ' (' + p.other + ')' : '');
            return '<option value="'+escH(p.name)+'">'+escH(label)+'</option>'; 
        }).join('');
    });
    
    // Populate Sale Deal Dropdown
    var dealSel = document.getElementById('tr-sale-deal');
    if (dealSel) {
        var activeOrders = state.orders.filter(function(o){ return o.status !== 'Delivered'; });
        dealSel.innerHTML = '<option value="">-- Select Order / Deal --</option>' + 
            activeOrders.map(function(o){ 
                return '<option value="'+o.id+'">'+escH(o.id + ' | ' + o.customer + ' | ' + o.product)+'</option>'; 
            }).join('');
    }
}
function renderProductsList() {
    document.getElementById('productsList').innerHTML = state.products.map(function(p) {
        var info = p.hsn ? ' [HSN: '+p.hsn+']' : '';
        return '<div class="product-tag">' +
                 '<span><b>'+escH(p.name)+'</b>'+escH(info)+'</span>' +
                 '<div style="display:flex;gap:5px;margin-left:10px;">' +
                   '<span class="edit-prod" title="Edit" onclick="editProduct(\''+p.name.replace(/'/g,"\\'")+'\')">&#x270F;</span>' +
                   '<span class="remove-prod" title="Delete" onclick="deleteProduct(\''+p.name.replace(/'/g,"\\'")+'\')">&#x2715;</span>' +
                 '</div>' +
               '</div>';
    }).join('');
}

function renderInventoryTable() {
    var q = document.getElementById('invSearch').value.toLowerCase();
    document.getElementById('invTable').innerHTML = state.inventory.filter(function(i){return i.product.toLowerCase().indexOf(q) >= 0;}).map(function(i) {
        var lvPct = Math.min(100, i.vol / i.threshold * 10);
        return '<tr><td><b>'+i.product+'</b></td><td>'+i.grade+'</td><td class="mono">'+i.density+'</td><td>'+i.tank+'</td><td class="mono">'+fmtN(i.vol)+'</td><td class="mono">'+fmtKG(toKG(i.vol,i.density))+'</td><td class="mono">'+fmt(i.cost)+'</td><td class="mono">'+fmt(i.vol*i.cost)+'</td><td><div class="progress" style="width:60px"><div class="progress-fill '+(i.vol>i.threshold?'green':'red')+'" style="width:'+lvPct+'%"></div></div></td><td><button class="btn btn-danger btn-sm" onclick="deleteItem(\'inventory\','+i.id+')">&#x2715;</button></td></tr>';
    }).join('');
}

function addInventory() {
    var product = document.getElementById('inv-product').value;
    var vol = parseFloat(document.getElementById('inv-vol').value);
    var cost = parseFloat(document.getElementById('inv-cost').value);

    if (!vol || !cost) {
        toast('Please fill quantity and price', true);
        return;
    }

    state.inventory.push({
        id: state.nextInvId++,
        product: product,
        grade: document.getElementById('inv-grade').value || '-',
        tank: document.getElementById('inv-tank').value || '-',
        vol: vol,
        cost: cost,
        threshold: parseFloat(document.getElementById('inv-thresh').value) || 1000,
        density: parseFloat(document.getElementById('inv-density').value) || getDensity(product),
        slip: document.getElementById('inv-slip').dataset.base64 || null
    });

    saveState();
    renderInventoryTable();
    renderDashboardKpis();
    renderInvLevels();
    clearInvForm();
    toast('Stock added successfully ✅');
}

function clearInvForm() {
    ['inv-grade','inv-vol','inv-kg','inv-cost','inv-cost-kg','inv-tank','inv-thresh'].forEach(function(id){document.getElementById(id).value='';});
    document.getElementById('inv-slip-preview').innerHTML = '<div class="photo-placeholder">&#x1F4F7;</div>';
}

function renderTradesTable() {
    document.getElementById('tradesTable').innerHTML = state.trades.slice().reverse().map(function(t) {
        var modeLabel = '';
        if (t.type === 'Buy') modeLabel = t.mode === 'import' ? 'Import' : 'Local';
        else modeLabel = t.mode === 'hs_sale' ? 'HS Sale' : 'Local';
        
        var modeInfo = ' <small>(' + modeLabel + ')</small>';
        var displayQty = t.raw_qty !== undefined ? t.raw_qty : t.vol;
        var unitSuffix = t.unit ? ' ' + t.unit : ' L';
        var hasShipDocs = t.ship_docs ? (Array.isArray(t.ship_docs) ? t.ship_docs.length > 0 : Object.keys(t.ship_docs).length > 0) : false;
        var hasDocs = (t.docs && t.docs.length > 0) || hasShipDocs;
        var boeBadge = t.boe_no ? ' <span class="badge badge-blue" style="font-size:9px; padding:1px 4px;" title="BOE: '+t.boe_no+'">BOE</span>' : '';
        var docBadge = hasDocs ? ' <span title="Documents attached" style="color:var(--gold2)">&#x1F4CE;</span>' : '';

        return '<tr><td class="mono">'+t.date+'</td><td><span class="badge '+(t.type==='Buy'?'badge-blue':'badge-green')+'">'+t.type+'</span>'+modeInfo+boeBadge+docBadge+'</td><td>'+t.product+'</td><td>'+t.party+'</td><td class="mono">'+fmtN(displayQty)+unitSuffix+'</td><td class="mono">'+fmt(t.price)+'</td><td class="mono">'+fmt(displayQty*t.price)+'</td><td><div style="display:flex;gap:4px"><button class="btn btn-primary btn-sm" onclick="editTrade('+t.id+')" title="Edit">&#x270F;</button><button class="btn btn-ghost btn-sm" onclick="printTradeReceipt('+t.id+')" title="Print">&#x1F5B6;</button>'+(t.mode==='import'?'<button class="btn btn-teal btn-sm" onclick="generateLandedCostReport('+t.id+')" title="Landed Cost Report">&#x1F4CA;</button>':'')+'<button class="btn btn-danger btn-sm" onclick="deleteItem(\'trades\','+t.id+')" title="Delete">&#x2715;</button></div></td></tr>';
    }).join('');
}
async function handleTradeDocUpload(input) {
    const files = input.files;
    if (!files || files.length === 0) return;
    
    toast("Uploading Documents...");
    for (let f of files) {
        try {
            const url = await uploadFileToSupabase(f, 'trades');
            currentTradeDocs.push({ name: f.name, url: url, size: f.size, date: today() });
        } catch (e) {
            toast("Failed to upload " + f.name, true);
        }
    }
    renderTradeDocs();
    if (currentTradeDocs.length > 0) document.getElementById('btn-scan-ai').style.display = 'inline-block';
}
function renderTradeDocs() {
    var list = document.getElementById('tr-docs-list');
    if (!list) return;
    list.innerHTML = currentTradeDocs.map(function(d, idx) {
        const docUrl = d.url || d.data;
        return '<div class="doc-item">' +
                 '<div style="flex:1; display:flex; flex-direction:column;">' +
                    '<input class="doc-name-input" value="'+escH(d.name)+'" onchange="renameTradeDoc('+idx+', this.value)">' +
                    '<small>' + (d.size ? (d.size/1024).toFixed(1) + ' KB' : 'Cloud File') + '</small>' +
                 '</div>' +
                 '<div style="display:flex; gap:5px">' +
                    '<button class="btn btn-sm btn-blue" onclick="openDocPreview(\''+docUrl+'\', \''+escH(d.name)+'\')">&#x1F441;</button>' +
                    '<button class="btn btn-sm btn-gray" onclick="window.open(\''+docUrl+'\',\'_blank\')">&#x2913;</button>' +
                    '<button class="btn btn-sm btn-danger" onclick="removeTradeDoc('+idx+')">&#x2715;</button>' +
                 '</div>' +
               '</div>';
    }).join('');
}
function renameTradeDoc(idx, newName) {
    if (!newName.trim()) return;
    currentTradeDocs[idx].name = newName.trim();
    toast('Document renamed');
}
function previewDoc(idx) {
    var d = currentTradeDocs[idx];
    openDocPreview(d.data, 'Preview: ' + d.name);
}
function removeTradeDoc(idx) {
    currentTradeDocs.splice(idx, 1);
    renderTradeDocs();
    if (currentTradeDocs.length === 0) document.getElementById('btn-scan-ai').style.display = 'none';
}
function downloadDoc(idx) {
    var d = currentTradeDocs[idx];
    var link = document.createElement('a');
    link.href = d.data;
    link.download = d.name;
    link.click();
}
async function scanTradeDocWithAI() {
    if (currentTradeDocs.length === 0) return;
    var btn = document.getElementById('btn-scan-ai');
    var oldBtnHtml = btn.innerHTML;
    btn.disabled = true;

    try {
        var doc = currentTradeDocs[0];
        if (!doc) return toast("No document found to scan", true);
        
        document.getElementById('tr-mode').value = 'import';
        toggleTradeDetailFields();

        if (state.apiKey) {
            // DIRECT AI SCAN (Best accuracy, skips local OCR)
            btn.innerHTML = '&#x2601; AI Vision Scanning...';
            await refineWithCloudAI(doc);
            btn.innerHTML = oldBtnHtml;
            btn.disabled = false;
        } else {
            // LOCAL OCR FALLBACK
            btn.innerHTML = '&#x2728; Local OCR Scanning...';
            var text = "";

            if (doc.type === 'application/pdf') {
                var pdf = await pdfjsLib.getDocument(doc.data).promise;
                for (var p = 1; p <= pdf.numPages; p++) {
                    var page = await pdf.getPage(p);
                    var viewport = page.getViewport({ scale: 2 });
                    var canvas = document.createElement('canvas');
                    var context = canvas.getContext('2d');
                    canvas.height = viewport.height; canvas.width = viewport.width;
                    await page.render({ canvasContext: context, viewport: viewport }).promise;
                    const result = await Tesseract.recognize(canvas.toDataURL('image/png'), 'eng');
                    text += "\n" + result.data.text;
                }
            } else {
                const result = await Tesseract.recognize(doc.data, 'eng');
                text = result.data.text;
            }
            
            var cleanText = text.replace(/[\[\]\|]/g, ' ').replace(/\s+/g, ' ').trim();
            // Local Regex extraction... (keeping for users without API key)
            runLocalExtract(cleanText); 
            
            toast('Local OCR Complete. Add API Key for 100% accuracy.');
            btn.innerHTML = oldBtnHtml;
            btn.disabled = false;
        }
    } catch (err) {
        console.error("Scan Error:", err);
        toast("Scan Error: " + err.message, true);
        btn.innerHTML = oldBtnHtml;
        btn.disabled = false;
    }
}

function runLocalExtract(cleanText) {
    var blMatch = cleanText.match(/BILL\s*OF\s*LADING\s*NO\.?[:\s]+([A-Z0-9.\s]+)/i) || cleanText.match(/TKU[\.\s][A-Z0-9\.\s]+/i);
    if (blMatch) document.getElementById('tr-bl-no').value = (blMatch[1]||blMatch[0]).trim().replace(/\s+/g, '.');
    
    var vMatch = cleanText.match(/VESSEL[:\s\n]+([A-Z0-9\s\[\]]+)/i);
    if (vMatch) document.getElementById('tr-vessel').value = vMatch[1].trim().split('\n')[0].replace(/[^A-Z0-9\s]/g, '');

    var weightMatch = cleanText.match(/(?:GROSS|NET)\s*WEIGHT\s*[:\s]*([0-9\.\s,]+)/i);
    if (weightMatch) document.getElementById('tr-net-weight').value = weightMatch[1].replace(/[\s,]/g, '');

    var containerMatches = cleanText.match(/[A-Z]{4}\s*[0-9]{7}/g) || cleanText.match(/[A-Z0-9]{10,12}/g);
    if (containerMatches) {
        var uniqueC = [...new Set(containerMatches)].map(c => c.replace(/\s+/g, '')).filter(c => /[A-Z]{3,4}/.test(c) && /[0-9]{6,7}/.test(c));
        document.getElementById('tr-containers').value = uniqueC.slice(0, 22).join(', ');
    }
}

async function refineWithCloudAI(docOrText) {
    if (!state.apiKey) return;
    var btn = document.getElementById('btn-scan-ai');
    
    try {
        const model = state.apiModel || 'gemini-3.1-flash-lite';
        let payload;

        if (typeof docOrText === 'object') {
            // MULTIMODAL DIRECT SCAN (Image/PDF)
            let base64Data;
            if (docOrText.data) {
                base64Data = docOrText.data.split(',')[1];
            } else if (docOrText.url) {
                // Fetch from cloud URL and convert to base64 for Gemini
                const response = await fetch(docOrText.url);
                const blob = await response.blob();
                base64Data = await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result.split(',')[1]);
                    reader.readAsDataURL(blob);
                });
            }
            
            if (!base64Data) throw new Error("Document data not found for AI scan.");

            payload = {
                contents: [{
                    parts: [
                        { text: `DOMAIN: International Oil Shipping. 
TASK: Extract Bill of Lading or Commercial Invoice data from this document.
RULES: 
1. Fix all OCR errors. Reconstruct the full list of container numbers (4 letters + 7 digits).
2. Format weights as 0.00. 
3. Identify Vessel, Ports, Agent, and HS Code.
4. If this is an Invoice, extract the "Invoice Number".
Return ONLY JSON: { "bl_no": "", "inv_no": "", "vessel": "", "port_load": "", "port_dis": "", "dest_agent": "", "hs_code": "", "net_weight": "", "containers": [] }` },
                        { inlineData: { mimeType: docOrText.type || "application/pdf", data: base64Data } }
                    ]
                }]
            };
        } else {
            // TEXT-ONLY REFINEMENT
            payload = {
                contents: [{
                    parts: [{ text: `DOMAIN: Oil Shipping. Extract JSON from this OCR: ${docOrText}` }]
                }]
            };
        }

        const response = await fetch('https://generativelanguage.googleapis.com/v1/models/' + model + ':generateContent?key=' + state.apiKey, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });



        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            const msg = errData.error ? errData.error.message : await response.text();
            
            if (response.status === 404) {
                throw new Error("Gemini Model Not Found (404). This usually means the model ID or API version is incorrect. Message: " + msg);
            }
            if (response.status === 403) {
                throw new Error("403 Forbidden: API Key invalid or restricted. Message: " + msg);
            }
            throw new Error("Gemini API Error (" + response.status + "): " + msg.substring(0, 150));
        }

        const data = await response.json();
        
        // Defensive check for Gemini response structure
        if (data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0]) {
            let rawJson = data.candidates[0].content.parts[0].text;
            
            // Clean up JSON if AI wrapped it in markdown code blocks
            rawJson = rawJson.replace(/```json/g, '').replace(/```/g, '').trim();
            
            const ai = JSON.parse(rawJson);
            
            if (ai.bl_no) document.getElementById('tr-bl-no').value = ai.bl_no;
            if (ai.inv_no) document.getElementById('tr-inv-no-intl').value = ai.inv_no;
            if (ai.vessel) document.getElementById('tr-vessel').value = ai.vessel;
            if (ai.port_load) document.getElementById('tr-port-load').value = ai.port_load;
            if (ai.port_dis) document.getElementById('tr-port-dis').value = ai.port_dis;
            if (ai.dest_agent) document.getElementById('tr-agent').value = ai.dest_agent;
            if (ai.hs_code) document.getElementById('tr-hs-code').value = ai.hs_code;
            if (ai.net_weight) {
                document.getElementById('tr-net-weight').value = ai.net_weight;
                syncWeightToQty();
            }
            if (ai.containers) document.getElementById('tr-containers').value = Array.isArray(ai.containers) ? ai.containers.join(', ') : ai.containers;
            
            calcTradeTotals();
            toast('&#x2728; Gemini AI Scan Perfected!');
        } else {
            throw new Error("Gemini API returned an unexpected data structure. Please try again.");
        }
    } catch (e) {
        console.error("Cloud AI Error:", e);
        toast(e.message, true);
    } finally {
        btn.innerHTML = '&#x2728; Scan with AI';
    }
}

function saveApiKey() {
    state.apiKey = document.getElementById('api-key').value;
    state.apiModel = document.getElementById('api-model').value;
    saveState();
    toast('AI Configuration Saved');
}

function runDemoScan() {
    document.getElementById('tr-bl-no').value = 'TKU.BEN.MUN.0002';
    document.getElementById('tr-vessel').value = 'ZULFA 2';
    document.getElementById('tr-port-load').value = 'JEBEL ALI SEAPORT, DUBAI';
    document.getElementById('tr-port-dis').value = 'MUNDRA, INDIA';
    document.getElementById('tr-agent').value = 'EZ LINERS LLP';
    document.getElementById('tr-hs-code').value = '38190090';
    document.getElementById('tr-net-weight').value = '589830.00';
    var cList = ['HCKU5703110', 'HLXU1663342', 'HMCU4118744', 'HMCU4171531', 'HMCU4171535', 'SSMU2202785', 'TCUU4141473', 'TCUU4478150', 'TCUU4481117', 'TCUU4481318', 'TCUU4534341', 'TCUU5234348', 'TCUU5534222', 'TGHU0903345', 'TGHU0941313', 'TRHU0492223', 'TRHU1703717', 'TRHU1712260', 'TRHU4532265', 'TRHU4622233', 'TXGU5133612', 'TXGU5443724'];
    document.getElementById('tr-containers').value = cList.join(', ');
    toast('Demo Auto-Fill for known document');
}
function highlightField(id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.classList.add('extracted-pulse');
    setTimeout(function(){ el.classList.remove('extracted-pulse'); }, 5000);
}
var editingTradeId = null;
function editTrade(id) {
    var t = state.trades.find(function(x){return x.id === id;});
    if (!t) return;
    editingTradeId = id;
    document.getElementById('tr-type').value = t.type;
    toggleTradeModeField();
    document.getElementById('tr-mode').value = t.mode || 'local';
    toggleTradeDetailFields();
    document.getElementById('tr-product').value = t.product;
    if (t.type === 'Buy' || (t.type === 'Sell' && state.buyers && state.buyers.length > 0)) {
        document.getElementById('tr-party-select').value = t.party;
    } else {
        document.getElementById('tr-party').value = t.party;
    }
    document.getElementById('tr-vol').value = t.raw_qty !== undefined ? t.raw_qty : t.vol;
    document.getElementById('tr-unit').value = t.unit || 'LITRE';
    document.getElementById('tr-density').value = t.density;
    document.getElementById('tr-date').value = t.date;
    document.getElementById('tr-terms').value = t.terms || 'Immediate';
    if (t.source_location) {
        populateSourceLocations();
        document.getElementById('tr-source-loc').value = t.source_location;
        checkSourceStock();
    }
    // Trade Docs handled below in specific section
    if (t.mode === 'import') {
        document.getElementById('tr-is-hs').checked = !!t.is_hs;
        document.getElementById('tr-inv-no-intl').value = t.inv_no_intl || '';
        document.getElementById('tr-bl-no').value = t.bl_no || '';
        document.getElementById('tr-vessel').value = t.vessel || '';
        document.getElementById('tr-port-load').value = t.port_load || '';
        document.getElementById('tr-port-dis').value = t.port_dis || '';
        document.getElementById('tr-ex-rate').value = t.ex_rate || '';
        document.getElementById('tr-imp-rate').value = t.imp_rate || '';
        document.getElementById('tr-imp-curr').value = t.currency || 'USD';
        document.getElementById('tr-agent').value = t.dest_agent || '';
        document.getElementById('tr-net-weight').value = t.net_weight || '';
        document.getElementById('tr-hs-code').value = t.hs_code || '';
        document.getElementById('tr-boe-no').value = t.boe_no || '';
        document.getElementById('tr-boe-date').value = t.boe_date || '';
        document.getElementById('tr-duty-amt').value = t.duty_amt || '';
        document.getElementById('tr-container-count').value = t.container_count || '';
        document.getElementById('tr-tank-rate').value = t.tank_rate || '';
        document.getElementById('tr-containers').value = t.containers || '';
        calcImportTotal();
    } else if (t.mode === 'hs_sale') {
        document.getElementById('tr-link-purchase').value = t.link_purchase_id || '';
        document.getElementById('tr-imp-rate').value = t.price;
    }

    // Load Expenses
    clearExpenses();
    if (t.expenses && Array.isArray(t.expenses)) {
        t.expenses.forEach(function(exp) {
            addExpenseRow(exp);
        });
    }

    document.getElementById('tr-is-hs').checked = !!t.is_hs;
    document.getElementById('tr-hs-seller').value = t.hs_seller || '';
    
    // Load Trade Docs (Cloud attachments)
    if (t.docs && Array.isArray(t.docs)) {
        currentTradeDocs = JSON.parse(JSON.stringify(t.docs));
    } else {
        currentTradeDocs = [];
    }
    renderTradeDocs();
    if (currentTradeDocs.length > 0) document.getElementById('btn-scan-ai').style.display = 'inline-block';
    else document.getElementById('btn-scan-ai').style.display = 'none';
    
    calcTradeTotals();
    
    // Load Ship Docs
    clearSupplierData();
    if (t.ship_docs) {
        if (Array.isArray(t.ship_docs)) {
            currentShipDocs = JSON.parse(JSON.stringify(t.ship_docs));
        } else {
            // Convert legacy object to new array format
            currentShipDocs = Object.keys(t.ship_docs).map(type => ({
                type: type,
                url: t.ship_docs[type].data || t.ship_docs[type].url,
                name: type,
                date: today()
            }));
        }
        renderShipDocs();
    }
    
    // Load Payments
    if (t.payments) {
        t.payments.forEach(p => addPaymentRow(p));
    }
    
    // Load Buyer Payments
    clearBuyerData();
    if (t.sale_inv_amt) document.getElementById('tr-sale-inv-amt').value = t.sale_inv_amt;
    if (t.sale_deal_id) document.getElementById('tr-sale-deal').value = t.sale_deal_id;
    if (t.buyer_payments) {
        t.buyer_payments.forEach(p => addBuyerPaymentRow(p));
    }
    updateBuyerPaymentSummary();
    
    var btn = document.querySelector('button[onclick="addTrade()"]');
    if (btn) { btn.innerHTML = '&#x1F4BE; Update Trade'; btn.classList.add('btn-blue'); }
    window.scrollTo({top:0, behavior:'smooth'});
}
function addTrade() {
    var type = document.getElementById('tr-type').value;
    var mode = document.getElementById('tr-mode').value;
    var product = document.getElementById('tr-product').value;
    var party = document.getElementById('tr-party-select-wrap').style.display !== 'none' ? document.getElementById('tr-party-select').value : document.getElementById('tr-party').value;
    var rawQty = parseFloat(document.getElementById('tr-vol').value);
    var den = parseFloat(document.getElementById('tr-density').value) || getDensity(product);
    var unit = document.getElementById('tr-unit').value;
    var storageLoc = document.getElementById('tr-storage-loc').value;
    
    var volInL = rawQty;
    if (unit === 'KG') volInL = rawQty / den;
    if (unit === 'MTON') volInL = (rawQty * 1000) / den;
    
    var price = 0;
    if (mode === 'import') {
        var rate = parseFloat(document.getElementById('tr-imp-rate').value) || 0;
        var isHs = document.getElementById('tr-is-hs').checked;
        var ex = isHs ? 1 : (parseFloat(document.getElementById('tr-ex-rate').value) || 1);
        price = rate * ex;
    } else if (mode === 'hs_sale') {
        price = parseFloat(document.getElementById('tr-imp-rate').value) || 0;
    } else {
        price = parseFloat(document.getElementById('tr-price-local').value) || 0;
    }
    
    if (!party || !rawQty || !price) return toast('Please fill all required fields', true);
    
    var termsVal = document.getElementById('tr-terms').value;
    if (termsVal === '__custom__') termsVal = document.getElementById('tr-custom-term-val').value || 'Custom';
    
    var trade = {
        type: type, mode: mode, product: product, party: party,
        vol: volInL, price: price, raw_qty: rawQty, unit: unit,
        date: document.getElementById('tr-date').value || today(),
        terms: termsVal, density: den, docs: currentTradeDocs,
        expenses: getTradeExpenses(),
        ship_docs: currentShipDocs,
        payments: getSupplierPayments(),
        buyer_payments: getBuyerPayments(),
        sale_inv_amt: parseFloat(document.getElementById('tr-sale-inv-amt').value) || 0,
        sale_deal_id: document.getElementById('tr-sale-deal').value || null,
        is_hs: document.getElementById('tr-is-hs').checked,
        hs_seller: document.getElementById('tr-hs-seller').value,
        location: storageLoc,
        source_location: document.getElementById('tr-source-loc') ? document.getElementById('tr-source-loc').value : null
    };
    
    if (type === 'Sell' && mode === 'hs_sale') trade.link_purchase_id = document.getElementById('tr-link-purchase').value;
    
    if (type === 'Buy') {
        if (mode === 'import') {
            trade.is_hs = document.getElementById('tr-is-hs').checked;
            trade.inv_no_intl = document.getElementById('tr-inv-no-intl').value;
            trade.bl_no = document.getElementById('tr-bl-no').value;
            trade.vessel = document.getElementById('tr-vessel').value;
            trade.port_load = document.getElementById('tr-port-load').value;
            trade.port_dis = document.getElementById('tr-port-dis').value;
            trade.ex_rate = document.getElementById('tr-ex-rate').value;
            trade.imp_rate = document.getElementById('tr-imp-rate').value;
            trade.currency = document.getElementById('tr-imp-curr').value;
            trade.imp_unit = document.getElementById('tr-unit').value;
            trade.total_for = document.getElementById('tr-total-for').value;
            trade.total_inr = document.getElementById('tr-total-inr-shared').value;
            trade.dest_agent = document.getElementById('tr-agent').value;
            trade.net_weight = document.getElementById('tr-net-weight').value;
            trade.hs_code = document.getElementById('tr-hs-code').value;
            trade.boe_no = document.getElementById('tr-boe-no').value;
            trade.boe_date = document.getElementById('tr-boe-date').value;
            trade.duty_amt = document.getElementById('tr-duty-amt').value;
            trade.container_count = document.getElementById('tr-container-count').value;
            trade.tank_rate = document.getElementById('tr-tank-rate').value;
            var cCount = parseFloat(trade.container_count) || 0;
            var tRateUSD = parseFloat(trade.tank_rate) || 0;
            var exR = parseFloat(document.getElementById('tr-ex-rate').value) || 1;
            trade.tank_cost = cCount * tRateUSD * exR;
            trade.containers = document.getElementById('tr-containers').value;
        } else {
            trade.inv_no = document.getElementById('tr-inv-no').value;
            trade.gst = document.getElementById('tr-gst').value;
            trade.veh = document.getElementById('tr-veh').value;
        }

        // AUTO-UPDATE YARD INVENTORY
        if (storageLoc && !trade.is_hs) {
            state.inventory.push({
                id: 'INV' + (state.nextInvId++),
                trade_id: trade.id,
                product: product,
                vol: volInL,
                density: den,
                weight_kg: toKG(volInL, den),
                location: storageLoc,
                date: trade.date,
                cost: price
            });
        }
    } else if (type === 'Move') {
        const sourceLoc = document.getElementById('tr-source-loc') ? document.getElementById('tr-source-loc').value : '';
        if (!sourceLoc || !storageLoc) return toast('Select source and destination', true);
        if (sourceLoc === storageLoc) return toast('Source and destination cannot be same', true);
        
        // Subtract from source
        state.inventory.push({
            id: 'INV' + (state.nextInvId++),
            trade_id: trade.id,
            date: trade.date,
            product: product,
            location: sourceLoc,
            vol: -volInL,
            weight_kg: -(volInL * den),
            density: den,
            unit_cost: 0,
            type: 'Internal Movement (Out)'
        });
        // Add to destination
        state.inventory.push({
            id: 'INV' + (state.nextInvId++),
            trade_id: trade.id,
            date: trade.date,
            product: product,
            location: storageLoc,
            vol: volInL,
            weight_kg: (volInL * den),
            density: den,
            unit_cost: 0,
            type: 'Internal Movement (In)'
        });
    } else if (type === 'Sell') {
        const sourceLoc = document.getElementById('tr-source-loc') ? document.getElementById('tr-source-loc').value : '';
        if (sourceLoc) {
            // Deduct from inventory
            state.inventory.push({
                id: 'INV' + (state.nextInvId++),
                trade_id: trade.id,
                product: product,
                vol: -volInL,
                density: den,
                weight_kg: -toKG(volInL, den),
                location: sourceLoc,
                date: trade.date,
                cost: 0,
                type: 'Sale Deduction'
            });
        }
    }

    if (editingTradeId) {
        var idx = state.trades.findIndex(function(x){return x.id === editingTradeId;});
        if (idx>=0) { trade.id = editingTradeId; state.trades[idx] = trade; }
        toast('Trade updated');
    } else {
        trade.id = state.nextTradeId++;
        state.trades.push(trade);
        toast('Trade recorded');
    }
    
    saveState(); renderTradesTable(); renderRecentTrades(); renderDashboardKpis();
    editingTradeId = null; currentTradeDocs = []; renderTradeDocs();
    document.getElementById('btn-scan-ai').style.display = 'none';
    var btn = document.querySelector('button[onclick="addTrade()"]');
    if (btn) { btn.innerHTML = '&#x1F4B1; Record Trade'; btn.classList.remove('btn-blue'); }
    ['tr-party','tr-vol','tr-price-local','tr-bl-no','tr-vessel','tr-port-load','tr-port-dis','tr-ex-rate','tr-inv-no','tr-gst','tr-veh','tr-imp-rate','tr-total-for','tr-total-inr-shared','tr-agent','tr-net-weight','tr-hs-code','tr-boe-no','tr-boe-date','tr-duty-amt','tr-containers','tr-storage-loc'].forEach(function(id){
        var el = document.getElementById(id); if (el) el.value = '';
    });
    document.getElementById('tr-party-select').value = '';
    document.getElementById('tr-is-hs').checked = false;
    document.getElementById('tr-sale-deal').value = '';
    document.getElementById('tr-sale-inv-amt').value = '';
    clearExpenses();
    clearSupplierData();
    clearBuyerData();
    toggleTradeDetailFields();
}

function renderOrdersTable() {
    document.getElementById('ordersTable').innerHTML = (state.orders || []).slice().reverse().map(function(o) {
        const isKG = o.unit === 'KG';
        const den = o.density || 0.850;
        const mainQty = isKG ? (o.qty * den) : o.qty;
        const mainRate = isKG ? (o.price / den) : o.price;
        const otherQty = isKG ? o.qty : (o.qty * den);
        const otherUnit = isKG ? 'L' : 'KG';
        const mainUnit = isKG ? 'KG' : 'L';
        
        // Final values for display
        const displayQty = isKG ? (o.qty_kg || (o.qty * den)) : o.qty;
        const displayRate = isKG ? (o.price_kg || (o.price / den)) : o.price;

        return '<tr>' +
            '<td class="mono">'+o.id+'</td>' +
            '<td><span class="badge '+(o.type==='PURCHASE'?'badge-blue':'badge-green')+'">'+(o.type||'SALE')+'</span></td>' +
            '<td><b>'+o.customer+'</b></td>' +
            '<td>'+o.product+'</td>' +
            '<td class="mono"><div>'+fmtN(displayQty.toFixed(1))+' '+mainUnit+'</div><small style="color:var(--muted)">'+fmtN(otherQty.toFixed(1))+' '+otherUnit+'</small></td>' +
            '<td class="mono"><div>\u20B9 '+displayRate.toFixed(2)+'</div><small style="color:var(--muted)">per '+mainUnit+'</small></td>' +
            '<td class="mono"><b>'+fmt(displayQty * displayRate)+'</b></td>' +
            '<td>'+statusBadge(o.status)+'</td>' +
            '<td class="mono">'+o.due+'</td>' +
            '<td style="display:flex;gap:4px">' +
                '<select onchange="updateOrderStatus(\''+o.id+'\',this.value)" style="font-size:10px;background:var(--bg);color:var(--text);border:1px solid var(--border)">' +
                    '<option '+(o.status==='Pending'?'selected':'')+'>Pending</option>' +
                    '<option '+(o.status==='Dispatched'?'selected':'')+'>Dispatched</option>' +
                    '<option '+(o.status==='Delivered'?'selected':'')+'>Delivered</option>' +
                '</select>' +
                '<button class="btn btn-sm btn-ghost" onclick="editOrder(\''+o.id+'\')" style="color:var(--teal)">&#x270F;</button>' +
                '<button class="btn btn-danger btn-sm" onclick="deleteOrder(\''+o.id+'\')">&#x2715;</button>' +
            '</td></tr>';
    }).join('');
}

var editingOrderId = null;
function editOrder(id) {
    const o = state.orders.find(x => x.id === id);
    if (!o) return;
    editingOrderId = id;
    
    document.getElementById('ord-type').value = o.type || 'SALE';
    populateOrderParties();
    document.getElementById('ord-customer').value = o.customer;
    document.getElementById('ord-product').value = o.product;
    document.getElementById('ord-density').value = o.density || 0.850;
    document.getElementById('ord-unit').value = o.unit || 'LITRE';
    
    document.getElementById('ord-qty').value = o.qty;
    document.getElementById('ord-price').value = o.price;
    document.getElementById('ord-date').value = o.date || today();
    document.getElementById('ord-due').value = o.due || '';
    document.getElementById('ord-priority').value = o.priority || 'Normal';
    
    dualCalc('ord', 'vol');
    priceCalc('ord', 'perL');
    
    const btn = document.querySelector('button[onclick="addOrder()"]');
    if (btn) {
        btn.innerHTML = '&#x1F4BE; Update Order';
        btn.classList.add('btn-blue');
    }
    window.scrollTo({top:0, behavior:'smooth'});
}

function addOrder() {
    var type = document.getElementById('ord-type').value;
    var customer = document.getElementById('ord-customer').value;
    var product = document.getElementById('ord-product').value;
    var unit = document.getElementById('ord-unit').value;
    var density = parseFloat(document.getElementById('ord-density').value) || 0.850;
    
    var qtyL = parseFloat(document.getElementById('ord-qty').value) || 0;
    var qtyKG = parseFloat(document.getElementById('ord-kg').value) || 0;
    var priceL = parseFloat(document.getElementById('ord-price').value) || 0;
    var priceKG = parseFloat(document.getElementById('ord-price-kg').value) || 0;

    if (!customer || (unit === 'LITRE' ? !qtyL || !priceL : !qtyKG || !priceKG)) {
        return toast('Please fill all required fields', true);
    }
    
    var orderData = {
        id: editingOrderId || ('ORD-' + String(state.nextOrderNum++).padStart(3, '0')),
        type: type,
        customer: customer,
        product: product,
        unit: unit,
        density: density,
        qty: qtyL,
        qty_kg: qtyKG,
        price: priceL,
        price_kg: priceKG,
        date: document.getElementById('ord-date').value || today(),
        due: document.getElementById('ord-due').value,
        priority: document.getElementById('ord-priority').value,
        status: 'Pending',
        terms: 'Immediate'
    };

    if (editingOrderId) {
        const idx = state.orders.findIndex(o => o.id === editingOrderId);
        if (idx >= 0) {
            orderData.id = editingOrderId;
            orderData.status = state.orders[idx].status;
            state.orders[idx] = orderData;
            toast('Order updated');
        }
        editingOrderId = null;
        const btn = document.querySelector('button[onclick="addOrder()"]');
        if (btn) {
            btn.innerHTML = '&#x1F4CB; Create Order';
            btn.classList.remove('btn-blue');
        }
    } else {
        orderData.id = 'ORD-' + String(state.nextOrderNum++).padStart(3, '0');
        state.orders.push(orderData);
        toast('Created ' + orderData.id);
    }
    
    saveState(); renderOrdersTable(); renderActiveOrders(); populateSelects();
    
    // Clear form
    ['ord-customer','ord-qty','ord-kg','ord-price','ord-price-kg','ord-due'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
}
function updateOrderStatus(id, s) {
    for (var i = 0; i < state.orders.length; i++) {
        if (state.orders[i].id === id) { state.orders[i].status = s; break; }
    }
    saveState(); renderOrdersTable(); renderActiveOrders(); populateSelects(); toast('Status updated');
}

function toggleChallanFields() {
    var t = document.getElementById('ch-type').value;
    document.getElementById('ch-from-group').querySelector('label').textContent = t==='in' ? 'Received From' : 'Dispatched From';
    document.getElementById('ch-to-group').querySelector('label').textContent = t==='in' ? 'Stored At' : 'Delivered To';
}
function renderChallansTable() {
    document.getElementById('challansTable').innerHTML = state.challans.slice().reverse().map(function(c) {
        return '<tr><td class="mono"><b>'+c.id+'</b></td><td>'+(c.type==='in'?'<span class="badge badge-teal">In</span>':'<span class="badge badge-green">Out</span>')+'</td><td class="mono">'+c.date+'</td><td>'+c.product+'</td><td class="mono">'+fmtN(c.vol)+'</td><td>'+(c.from||'-')+'</td><td>'+(c.to||'-')+'</td><td class="mono">'+c.vehicle+'</td><td style="display:flex;gap:4px"><button class="btn btn-primary btn-sm" onclick="downloadChallanPDF(\''+c.id+'\')">PDF</button><button class="btn btn-green btn-sm" onclick="shareWhatsApp(\''+c.id+'\')">WA</button><button class="btn btn-danger btn-sm" onclick="deleteChallan(\''+c.id+'\')">&#x2715;</button></td></tr>';
    }).join('');
}
function addChallan() {
    var type = document.getElementById('ch-type').value;
    var no = document.getElementById('ch-no').value.trim();
    if (!no) no = 'CH-' + String(state.nextChNum).padStart(3, '0');
    var product = document.getElementById('ch-product').value;
    var density = parseFloat(document.getElementById('ch-density').value) || getDensity(product);
    var vol = parseFloat(document.getElementById('ch-vol').value);
    if (!vol) return toast('Enter quantity', true);
    state.challans.push({
        id: no, type: type,
        date: document.getElementById('ch-date').value || today(),
        product: product, vol: vol, density: density,
        weight: toKG(vol, density),
        from: document.getElementById('ch-from').value,
        to: document.getElementById('ch-to').value,
        vehicle: document.getElementById('ch-vehicle').value,
        driver: document.getElementById('ch-driver').value,
        driverPh: document.getElementById('ch-driver-ph').value
    });
    if (!document.getElementById('ch-no').value.trim()) state.nextChNum++;
    saveState(); renderChallansTable(); toast('Created ' + no);
}

function renderSuppliersTable() {
    document.getElementById('suppliersTable').innerHTML = state.suppliers.map(function(s) {
        var typeBadge = s.type === 'import' ? '<span class="badge badge-teal">Import</span>' : '<span class="badge badge-gray">Local</span>';
        var bankInfo = '-';
        if (s.type === 'import') {
            bankInfo = '<div style="font-size:10px;color:var(--muted)">' + 
                       (s.bankIban ? 'IBAN: '+escH(s.bankIban) : (s.bankName ? escH(s.bankName) : '-')) + 
                       (s.bankSwift ? ' <br>SWIFT: '+escH(s.bankSwift) : '') + 
                       '</div>';
        } else if (s.bankName) {
            bankInfo = '<div style="font-size:10px;color:var(--muted)">'+escH(s.bankName)+' - '+escH(s.bankAc)+'</div>';
        }
        
        return '<tr><td><b>'+escH(s.name)+'</b></td><td>'+typeBadge+'</td><td>'+escH(s.contact)+'</td><td class="mono">'+escH(s.phone)+'</td><td>'+escH(s.city)+'</td><td>'+bankInfo+'</td><td>' +
               '<div style="display:flex;gap:4px">' +
                 '<button class="btn btn-primary btn-sm" onclick="editSupplier('+s.id+')">&#x270F;</button>' +
                 '<button class="btn btn-danger btn-sm" onclick="deleteItem(\'suppliers\','+s.id+')">&#x2715;</button>' +
               '</div></td></tr>';
    }).join('');
}
function toggleSupIntlFields() {
    var type = document.getElementById('sup-type').value;
    var intl = document.querySelectorAll('.sup-intl-fields');
    var local = document.getElementById('sup-ifsc-group');
    if (type === 'import') {
        intl.forEach(function(el){ el.style.display = 'flex'; });
        local.style.display = 'none';
    } else {
        intl.forEach(function(el){ el.style.display = 'none'; });
        local.style.display = 'flex';
    }
}
var editingSupId = null;
function editSupplier(id) {
    var s = state.suppliers.find(function(x){return x.id === id;});
    if (!s) return;
    editingSupId = id;
    document.getElementById('sup-name').value = s.name;
    document.getElementById('sup-type').value = s.type;
    document.getElementById('sup-contact').value = s.contact;
    document.getElementById('sup-phone').value = s.phone;
    document.getElementById('sup-city').value = s.city;
    document.getElementById('sup-bank-name').value = s.bankName || '';
    document.getElementById('sup-bank-ac').value = s.bankAc || '';
    document.getElementById('sup-bank-ifsc').value = s.bankIfsc || '';
    document.getElementById('sup-bank-iban').value = s.bankIban || '';
    document.getElementById('sup-bank-swift').value = s.bankSwift || '';
    document.getElementById('sup-bank-curr').value = s.bankCurr || 'USD';
    
    toggleSupIntlFields();
    
    var btn = document.getElementById('btn-add-supplier');
    btn.innerHTML = '&#x1F4BE; Update Supplier';
    btn.classList.add('btn-blue');
    window.scrollTo({top:0, behavior:'smooth'});
}
function clearSupForm() {
    editingSupId = null;
    ['sup-name','sup-contact','sup-phone','sup-city','sup-bank-name','sup-bank-ac','sup-bank-ifsc','sup-bank-iban','sup-bank-swift'].forEach(function(id){
        var el = document.getElementById(id); if (el) el.value = '';
    });
    toggleSupIntlFields();
    var btn = document.getElementById('btn-add-supplier');
    btn.innerHTML = '&#x1F3ED; Add Supplier';
    btn.classList.remove('btn-blue');
}
function addSupplier() {
    var n = document.getElementById('sup-name').value;
    var t = document.getElementById('sup-type').value;
    if (!n) return toast('Enter company name', true);
    
    var supData = {
        name: n, type: t,
        contact: document.getElementById('sup-contact').value,
        phone: document.getElementById('sup-phone').value,
        city: document.getElementById('sup-city').value,
        bankName: document.getElementById('sup-bank-name').value,
        bankAc: document.getElementById('sup-bank-ac').value,
        bankIfsc: document.getElementById('sup-bank-ifsc').value,
        bankIban: document.getElementById('sup-bank-iban').value,
        bankSwift: document.getElementById('sup-bank-swift').value,
        bankCurr: document.getElementById('sup-bank-curr').value
    };

    if (editingSupId) {
        var idx = state.suppliers.findIndex(function(x){return x.id === editingSupId;});
        if (idx>=0) state.suppliers[idx] = Object.assign(state.suppliers[idx], supData);
        toast('Supplier updated');
    } else {
        supData.id = state.nextSupId++;
        state.suppliers.push(supData);
        toast('Supplier added');
    }
    saveState(); renderSuppliersTable(); clearSupForm();
}

/* ═══════ BUYERS ═══════ */
function renderBuyersTable() {
    document.getElementById('buyersTable').innerHTML = state.buyers.map(function(b) {
        var bankInfo = b.bankName ? '<div style="font-size:10px;color:var(--muted)">'+escH(b.bankName)+' - '+escH(b.bankAc)+'</div>' : '-';
        return '<tr><td><b>'+escH(b.name)+'</b></td><td>'+escH(b.contact)+'</td><td class="mono">'+escH(b.phone)+'</td><td>'+escH(b.city)+'</td><td>'+bankInfo+'</td><td>' +
               '<div style="display:flex;gap:4px">' +
                 '<button class="btn btn-primary btn-sm" onclick="editBuyer('+b.id+')">&#x270F;</button>' +
                 '<button class="btn btn-danger btn-sm" onclick="deleteItem(\'buyers\','+b.id+')">&#x2715;</button>' +
               '</div></td></tr>';
    }).join('');
}
var editingBuyId = null;
function editBuyer(id) {
    var b = state.buyers.find(function(x){return x.id === id;});
    if (!b) return;
    editingBuyId = id;
    document.getElementById('buy-name').value = b.name;
    document.getElementById('buy-contact').value = b.contact;
    document.getElementById('buy-phone').value = b.phone;
    document.getElementById('buy-city').value = b.city;
    document.getElementById('buy-bank-name').value = b.bankName || '';
    document.getElementById('buy-bank-ac').value = b.bankAc || '';
    document.getElementById('buy-bank-ifsc').value = b.bankIfsc || '';
    
    var btn = document.getElementById('btn-add-buyer');
    btn.innerHTML = '&#x1F4BE; Update Buyer';
    btn.classList.add('btn-blue');
    window.scrollTo({top:0, behavior:'smooth'});
}
function clearBuyForm() {
    editingBuyId = null;
    ['buy-name','buy-contact','buy-phone','buy-city','buy-bank-name','buy-bank-ac','buy-bank-ifsc'].forEach(function(id){document.getElementById(id).value='';});
    var btn = document.getElementById('btn-add-buyer');
    btn.innerHTML = '&#x1F464; Add Buyer';
    btn.classList.remove('btn-blue');
}
function addBuyer() {
    var n = document.getElementById('buy-name').value;
    if (!n) return toast('Enter company name', true);
    
    var buyData = {
        name: n,
        contact: document.getElementById('buy-contact').value,
        phone: document.getElementById('buy-phone').value,
        city: document.getElementById('buy-city').value,
        bankName: document.getElementById('buy-bank-name').value,
        bankAc: document.getElementById('buy-bank-ac').value,
        bankIfsc: document.getElementById('buy-bank-ifsc').value
    };

    if (editingBuyId) {
        var idx = state.buyers.findIndex(function(x){return x.id === editingBuyId;});
        if (idx>=0) state.buyers[idx] = Object.assign(state.buyers[idx], buyData);
        toast('Buyer updated');
    } else {
        buyData.id = state.nextBuyId++;
        state.buyers.push(buyData);
        toast('Buyer added');
    }
    saveState(); renderBuyersTable(); clearBuyForm();
}

function renderReports() {
    var sales = 0, buys = 0;
    for (var i = 0; i < state.trades.length; i++) {
        var t = state.trades[i];
        var displayQty = t.raw_qty !== undefined ? t.raw_qty : t.vol;
        if (t.type === 'Sell') sales += displayQty * t.price;
        else buys += displayQty * t.price;
    }
    var profit = sales - buys;
    document.getElementById('reportKpis').innerHTML =
        kpiC('Sales', fmt(sales), '') +
        kpiC('Purchases', fmt(buys), '') +
        kpiC('Profit', fmt(profit), '');
    document.getElementById('plSummary').innerHTML =
        '<div class="form-group"><label>Order Type</label><select id="ord-type" onchange="populateOrderParties()"><option value="SALE">Sale Order</option><option value="PURCHASE">Purchase Order</option></select></div><div class="form-group"><label>Party / Customer</label><select id="ord-customer"></select></div>' +
        '<div class="stat-row"><span>Total Revenue</span><span class="stat-val up">'+fmt(sales)+'</span></div>' +
        '<div class="stat-row"><span>Total Expenses</span><span class="stat-val down">'+fmt(buys)+'</span></div>' +
        '<div class="stat-row"><span>Net Profit</span><span class="stat-val '+(profit>=0?'up':'down')+'">'+fmt(profit)+'</span></div>';
    var cust = {};
    for (var i = 0; i < state.trades.length; i++) {
        var t = state.trades[i];
        var displayQty = t.raw_qty !== undefined ? t.raw_qty : t.vol;
        if (t.type === 'Sell') cust[t.party] = (cust[t.party]||0) + (displayQty * t.price);
    }
    var top = Object.keys(cust).map(function(k){return [k, cust[k]];}).sort(function(a,b){return b[1]-a[1];}).slice(0, 5);
    document.getElementById('topCustomers').innerHTML = top.map(function(c) {
        return '<div class="stat-row"><span>'+c[0]+'</span><span class="stat-val">'+fmt(c[1])+'</span></div>';
    }).join('') || '<div class="empty">No sales data yet</div>';
}

/* ═══════ DELETE ACTIONS ═══════ */
var _confirmResolve = null;
function customConfirm(msg) {
    document.getElementById('confirmMsg').textContent = msg;
    document.getElementById('confirmModal').classList.add('show');
    return new Promise(function(r){ _confirmResolve = r; });
}
document.getElementById('confirmYes').onclick = function() {
    document.getElementById('confirmModal').classList.remove('show');
    if (_confirmResolve) _confirmResolve(true);
};
document.getElementById('confirmNo').onclick = function() {
    document.getElementById('confirmModal').classList.remove('show');
    if (_confirmResolve) _confirmResolve(false);
};

function deleteItem(arr, id) {
    customConfirm('Remove this item?').then(function(ok) {
        if (!ok) return;
        state[arr] = state[arr].filter(function(x){ return x.id !== id; });
        saveState();
        if (arr === 'inventory') { renderInventoryTable(); renderDashboardKpis(); renderInvLevels(); }
        if (arr === 'trades') { renderTradesTable(); renderRecentTrades(); renderDashboardKpis(); }
        if (arr === 'suppliers') renderSuppliersTable();
        toast('Removed');
    });
}
function deleteOrder(id) {
    customConfirm('Delete order ' + id + '?').then(function(ok) {
        if (!ok) return;
        state.orders = state.orders.filter(function(o){ return o.id !== id; });
        saveState(); renderOrdersTable(); renderActiveOrders(); populateSelects(); toast('Order removed');
    });
}
function deleteChallan(id) {
    customConfirm('Delete challan ' + id + '?').then(function(ok) {
        if (!ok) return;
        state.challans = state.challans.filter(function(c){ return c.id !== id; });
        saveState(); renderChallansTable(); toast('Challan removed');
    });
}
function deleteProduct(n) {
    customConfirm('Delete product "' + n + '"?').then(function(ok) {
        if (!ok) return;
        state.products = state.products.filter(function(p){ return p !== n; });
        saveState(); populateSelects(); renderProductsList(); toast('Product removed');
    });
}
var editingProductName = null;

function editProduct(n) {
    var p = state.products.find(function(x) { return x.name === n; });
    if (!p) return;
    
    editingProductName = n;
    document.getElementById('pm-name').value = p.name;
    document.getElementById('pm-other').value = p.other || '';
    document.getElementById('pm-hsn').value = p.hsn || '';
    document.getElementById('pm-density').value = p.density;
    
    var btn = document.querySelector('.page.active button[onclick="addProductMaster()"]');
    if (btn) {
        btn.innerHTML = '&#x1F4BE; Update Product';
        btn.classList.add('btn-blue');
    }
    toast('Editing: ' + n);
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function addProductMaster() {
    var n = document.getElementById('pm-name').value.trim();
    var other = document.getElementById('pm-other').value.trim();
    var hsn = document.getElementById('pm-hsn').value.trim();
    var density = parseFloat(document.getElementById('pm-density').value) || 0.85;

    if (!n) return toast('Enter product name', true);
    
    if (editingProductName) {
        // Update existing
        var idx = state.products.findIndex(function(p) { return p.name === editingProductName; });
        if (idx >= 0) {
            state.products[idx] = { name: n, other: other, hsn: hsn, density: density };
            toast('Updated: ' + n);
        }
        editingProductName = null;
        var btn = document.querySelector('.page.active button[onclick="addProductMaster()"]');
        if (btn) {
            btn.innerHTML = '&#x2795; Add Product';
            btn.classList.remove('btn-blue');
        }
    } else {
        // Add new
        var exists = state.products.some(function(p) { return p.name.toLowerCase() === n.toLowerCase(); });
        if (exists) return toast('Product already exists', true);

        state.products.push({
            name: n,
            other: other,
            hsn: hsn,
            density: density
        });
        toast('Added: ' + n);
    }

    saveState(); populateSelects(); renderProductsList();
    
    document.getElementById('pm-name').value = '';
    document.getElementById('pm-other').value = '';
    document.getElementById('pm-hsn').value = '';
    document.getElementById('pm-density').value = '';
}

/* ═══════ TOAST ═══════ */
var _toastTimer = null;
function toast(msg, isErr) {
    var el = document.getElementById('toast');
    el.textContent = msg;
    el.className = 'toast show' + (isErr ? ' err' : '');
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(function(){ el.classList.remove('show'); }, 4000);
}

/* ═══════ PAGE SWITCH ═══════ */
function switchPage(name) {
    document.querySelectorAll('.page').forEach(function(p){ p.classList.remove('active'); });
    document.querySelectorAll('.nav-tab').forEach(function(t){ t.classList.remove('active'); });
    if (event && event.target) event.target.classList.add('active');
    document.getElementById('page-' + name).classList.add('active');
    if (name === 'reports') renderReports();
    if (name === 'trades') populateSelects();
}

/* ═══════ TICKER ═══════ */
function renderTicker() {
    var prices = {'Crude Oil':6250,'Diesel':92.5,'Petrol':104.2,'Kerosene':78.3,'LPG':58.1};
    var changes = {'Crude Oil':'+1.2%','Diesel':'-0.3%','Petrol':'+0.5%','Kerosene':'-0.1%','LPG':'+0.8%'};
    document.getElementById('tickerEl').innerHTML = Object.keys(prices).map(function(p) {
        var ch = changes[p];
        var cls = ch.indexOf('+') >= 0 ? 'up' : 'down';
        return '<div class="ticker-item"><div class="ticker-name">'+p+'</div><div class="ticker-price">'+(p==='Crude Oil'?'$'+fmtN(prices[p]):fmt(prices[p]))+'</div><div class="ticker-chg '+cls+'">'+ch+'</div></div>';
    }).join('');
}

/* ═══════ INIT ═══════ */
document.getElementById('tr-date').value = today();
document.getElementById('ord-date').value = today();
document.getElementById('ch-date').value = today();
// rendering is now handled by loadState() -> initApp()
// --- LOGISTICS & EXPENSES LOGIC ---
var currentTradeExpenses = [];

function addExpenseRow(data) {
    const tbody = document.getElementById('tr-expenses-body');
    const rowId = 'exp_' + Date.now() + Math.random().toString(36).substr(2, 5);
    
    const row = document.createElement('tr');
    row.id = rowId;
    row.className = 'expense-row';
    row.style.borderBottom = '1px solid var(--border)';
    
    const mode = document.getElementById('tr-mode').value;
    let types = [];
    if (mode === 'local') {
        types = ['Transportation', 'Truck Hire', 'Loading Charges', 'Unloading Charges', 'Commission', 'Other'];
    } else {
        types = ['Line Charges', 'CFS Charges', 'LOLO Charges', 'Customs Duty', 'THC Fees', 'Agency Fees', 'Transportation', 'Truck Hire', 'Insurance', 'Survey', 'Other'];
    }
    
    const defaultType = data ? data.type : (mode === 'local' ? 'Truck Hire' : 'Line Charges');
    const isOther = !types.includes(defaultType) && defaultType !== 'Other';
    const finalType = isOther ? 'Other' : defaultType;
    
    const defaultAmount = data ? data.amount : 0;
    const defaultStatus = data ? data.status : 'Pending';
    const defaultRef = data ? data.ref : '';
    const defaultDoc = data ? data.doc : null;
    
    const defaultDate = data ? (data.date || today()) : today();
    
    row.innerHTML = `
        <td style="padding:8px;"><input type="date" class="exp-date" value="${defaultDate}" oninput="updateExpenseData('${rowId}')"></td>
        <td style="padding:8px;">
            <select onchange="handleExpenseTypeChange('${rowId}', this.value)" style="width:100%;">
                ${types.map(t => `<option ${finalType === t ? 'selected' : ''}>${t}</option>`).join('')}
            </select>
            <input type="text" class="exp-custom-type" value="${isOther ? defaultType : ''}" 
                   placeholder="Name..." style="display:${isOther ? 'block' : 'none'}; margin-top:5px; border-bottom:1px solid var(--border) !important;">
        </td>
        <td style="padding:8px;"><input type="number" class="exp-net" value="${data ? (data.net_amount || data.amount) : defaultAmount}" placeholder="0.00" oninput="calcExpTotal('${rowId}')"></td>
        <td style="padding:8px;"><input type="number" class="exp-tax" value="${data ? (data.tax_amount || 0) : 0}" placeholder="0.00" oninput="calcExpTotal('${rowId}')"></td>
        <td style="padding:8px;"><input type="number" class="exp-total" value="${data ? (data.total_amount || data.amount) : defaultAmount}" placeholder="0.00" readonly style="background:var(--surface2); color:var(--teal); font-weight:bold;"></td>
        <td style="padding:8px;">
            <select onchange="updateExpenseData('${rowId}')" style="width:auto;">
                <option ${defaultStatus === 'Paid' ? 'selected' : ''}>Paid</option>
                <option ${defaultStatus === 'Pending' ? 'selected' : ''}>Pending</option>
            </select>
        </td>
        <td style="padding:8px;">
            <div style="display:flex; gap:5px; align-items:center;">
                <input type="text" value="${defaultRef}" placeholder="Ref No" style="flex:1" oninput="updateExpenseData('${rowId}')">
                <button class="btn btn-sm btn-ghost ${defaultDoc ? 'btn-teal' : ''}" onclick="uploadExpenseDoc('${rowId}')" id="btn-upload-${rowId}" title="Upload Bill">
                    &#x1F4CE;
                </button>
                <button class="btn btn-sm btn-ghost" id="btn-view-${rowId}" style="display:${defaultDoc ? 'inline-block' : 'none'}" onclick="viewExpenseDoc('${rowId}')" title="View Bill">
                    &#x1F441;
                </button>
            </div>
            <input type="file" id="file-${rowId}" style="display:none" onchange="handleExpenseFileUpload('${rowId}', this)">
        </td>
        <td style="padding:8px; text-align:center; white-space:nowrap;">
            <button class="btn btn-sm btn-blue btn-edit-toggle" onclick="toggleExpenseLock('${rowId}')" title="Lock/Edit">
                <span class="lock-icon">&#x1F4BE;</span>
            </button>
            <button class="btn btn-sm btn-ghost btn-remove" onclick="removeExpenseRow('${rowId}')" style="color:var(--red)">&#x2715;</button>
        </td>
    `;
    
    tbody.appendChild(row);
    row.dataset.doc = defaultDoc || '';
    updateExpenseData(rowId);
}

function handleExpenseTypeChange(rowId, val) {
    const row = document.getElementById(rowId);
    const customInput = row.querySelector('.exp-custom-type');
    customInput.style.display = (val === 'Other') ? 'block' : 'none';
    updateExpenseData(rowId);
}

function calcExpTotal(rowId) {
    const row = document.getElementById(rowId);
    if (!row) return;
    const net = parseFloat(row.querySelector('.exp-net').value) || 0;
    const tax = parseFloat(row.querySelector('.exp-tax').value) || 0;
    row.querySelector('.exp-total').value = (net + tax).toFixed(2);
    updateExpenseData(rowId);
}

function toggleExpenseLock(rowId) {
    const row = document.getElementById(rowId);
    if (!row) return;
    const isLocked = row.classList.toggle('locked');
    const btn = row.querySelector('.btn-edit-toggle');
    const icon = btn.querySelector('.lock-icon');
    
    if (isLocked) {
        icon.innerHTML = '&#x270F;'; // Pencil (Edit)
        btn.classList.remove('btn-blue');
        btn.classList.add('btn-ghost');
        toast('Record Locked');
    } else {
        icon.innerHTML = '&#x1F4BE;'; // Diskette (Save)
        btn.classList.remove('btn-ghost');
        btn.classList.add('btn-blue');
        toast('Editing Enabled');
    }
}

function uploadExpenseDoc(rowId) {
    document.getElementById('file-' + rowId).click();
}

async function handleExpenseFileUpload(rowId, input) {
    const file = input.files[0];
    if (!file) return;
    
    try {
        const uploadBtn = document.getElementById('btn-upload-' + rowId);
        uploadBtn.innerHTML = '...';
        
        const url = await uploadFileToSupabase(file, 'expenses');
        const row = document.getElementById(rowId);
        row.dataset.doc = url;
        
        uploadBtn.innerHTML = '&#x1F4CE;';
        uploadBtn.classList.add('btn-teal');
        
        const viewBtn = document.getElementById('btn-view-' + rowId);
        viewBtn.style.display = 'inline-block';
        
        toast('Bill uploaded to Cloud');
    } catch (e) {
        toast("Upload Failed: " + e.message, true);
    }
}

function viewExpenseDoc(rowId) {
    const row = document.getElementById(rowId);
    const data = row.dataset.doc;
    if (!data) return toast('No document found', true);
    
    openDocPreview(data, 'Expense Receipt Preview');
}

function getTradeExpenses() {
    const rows = document.querySelectorAll('#tr-expenses-body tr');
    const expenses = [];
    rows.forEach(row => {
        const selects = row.querySelectorAll('select');
        const customType = row.querySelector('.exp-custom-type');
        
        let type = selects[0].value;
        if (type === 'Other') type = customType.value || 'Other Expense';
        
        const net = parseFloat(row.querySelector('.exp-net').value) || 0;
        const tax = parseFloat(row.querySelector('.exp-tax').value) || 0;
        const total = parseFloat(row.querySelector('.exp-total').value) || 0;

        expenses.push({
            type: type,
            net_amount: net,
            tax_amount: tax,
            total_amount: total,
            amount: total, // Legacy compatibility
            status: selects[1].value,
            ref: row.querySelector('input[placeholder="Ref No"]').value,
            doc: row.dataset.doc || null
        });
    });
    return expenses;
}

function removeExpenseRow(id) {
    const row = document.getElementById(id);
    if (row) row.remove();
    updateTotalExpenses();
}

function updateExpenseData(rowId) {
    updateTotalExpenses();
}

function updateTotalExpenses() {
    const rows = document.querySelectorAll('#tr-expenses-body tr');
    let total = 0;
    rows.forEach(row => {
        const amtEl = row.querySelector('.exp-total');
        const amt = amtEl ? (parseFloat(amtEl.value) || 0) : 0;
        total += amt;
    });
    document.getElementById('tr-total-expenses').innerHTML = '&#x20B9; ' + total.toLocaleString('en-IN', {minimumFractionDigits:2});
    
    // Also trigger the main trade total update to show Landed Cost
    if (typeof calcTradeTotals === 'function') calcTradeTotals();
}

function clearExpenses() {
    const tbody = document.getElementById('tr-expenses-body');
    if (tbody) tbody.innerHTML = '';
    updateTotalExpenses();
}

// --- SHIPPING DOCUMENTS & PAYMENTS ---

function uploadShipDoc(btn) {
    activeShipDocItem = btn.closest('.ship-doc-item');
    document.getElementById('tr-ship-doc-upload').click();
}

async function handleShipDocUpload(input) {
    const files = input.files;
    if (!files || files.length === 0) return;
    
    toast("Uploading Shipping Docs...");
    for (let f of files) {
        try {
            const url = await uploadFileToSupabase(f, 'shipping');
            const type = activeShipDocItem ? activeShipDocItem.dataset.type : 'Other';
            currentShipDocs.push({ name: f.name, url: url, type: type, date: today() });
        } catch (e) {
            toast("Failed to upload " + f.name, true);
        }
    }
    renderShipDocs();
}

function updateShipDocType(select) {
    if (currentShipDocs['Bill of Lading']) {
        currentShipDocs['Bill of Lading'].subType = select.value;
    }
}

function renderShipDocs() {
    const list = document.getElementById('tr-ship-docs-list');
    if (!list) return;
    
    // Reset highlights
    document.querySelectorAll('.ship-doc-item').forEach(i => i.classList.remove('active'));
    
    list.innerHTML = currentShipDocs.map((doc, idx) => {
        // Highlight checklist item
        const checklistItem = document.querySelector(`.ship-doc-item[data-type="${doc.type}"]`);
        if (checklistItem) checklistItem.classList.add('active');
        
        const docUrl = doc.data || doc.url;
        const icon = doc.type === 'Bill of Lading' ? '🚢' : doc.type === 'Bill of Entry' ? '📝' : '📄';

        return `
            <div class="ship-doc-badge">
                <div class="doc-info">
                    <div class="doc-icon">${icon}</div>
                    <div class="doc-text">
                        <span class="doc-type">${doc.type}</span>
                        <span class="doc-name">${doc.name}</span>
                    </div>
                </div>
                <div class="doc-actions">
                    <button class="doc-btn" onclick="openDocPreview('${docUrl}', '${doc.name} Preview')" title="View">&#x1F441;</button>
                    <button class="doc-btn" onclick="window.open('${docUrl}','_blank')" title="Download">&#x2913;</button>
                    <button class="doc-btn del" onclick="currentShipDocs.splice(${idx},1); renderShipDocs()" title="Delete">&#x2715;</button>
                </div>
            </div>
        `;
    }).join('');
}

function viewShipDoc(btn) {
    const item = btn.closest('.ship-doc-item');
    const type = item.dataset.type;
    const docObj = currentShipDocs.find(d => d.type === type);
    if (!docObj) return;
    openDocPreview(docObj.data || docObj.url, type + ' Preview');
}

function openDocPreview(data, title) {
    const modal = document.getElementById('docPreviewModal');
    const container = document.getElementById('docPreviewContainer');
    const titleEl = document.getElementById('previewDocTitle');
    
    if (!modal || !container) {
        window.open(data, "_blank");
        return;
    }
    
    titleEl.textContent = title || 'Document Preview';
    if (container.dataset.previewUrl) URL.revokeObjectURL(container.dataset.previewUrl);
    container.innerHTML = '';
    
    const isPdf = data.startsWith('data:application/pdf') || (typeof data === 'string' && data.toLowerCase().endsWith('.pdf'));
    const isUrl = typeof data === 'string' && data.startsWith('http');

    if (isPdf) {
        let url = data;
        if (data.startsWith('data:')) {
            const blob = dataUriToBlob(data);
            url = URL.createObjectURL(blob);
            container.dataset.previewUrl = url;
        }
        container.innerHTML = `<iframe src="${url}" style="width:100%; height:100%; border:none;"></iframe>`;
    } else {
        container.innerHTML = `<div style="width:100%; height:100%; overflow:auto; display:flex; justify-content:center; align-items:center; background:#111;">
            <img src="${data}" style="max-width:100%; max-height:100%; object-fit:contain;">
        </div>`;
    }
    modal.classList.add('show');
}

function dataUriToBlob(dataURI) {
    const byteString = atob(dataURI.split(',')[1]);
    const mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0];
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
    }
    return new Blob([ab], {type: mimeString});
}

function closeDocPreview() {
    const modal = document.getElementById('docPreviewModal');
    if (modal) modal.classList.remove('show');
    
    const container = document.getElementById('docPreviewContainer');
    // Clear container to stop any playing media/iframes
    setTimeout(() => {
        if (container.dataset.previewUrl) {
            URL.revokeObjectURL(container.dataset.previewUrl);
            delete container.dataset.previewUrl;
        }
        container.innerHTML = '';
    }, 300);
}

function deleteShipDoc(btn) {
    const item = btn.closest('.ship-doc-item');
    const type = item.dataset.type;
    delete currentShipDocs[type];
    item.classList.remove('active');
    toast(type + ' Removed');
}

function addPaymentRow(data) {
    const tbody = document.getElementById('tr-payments-body');
    const rowId = 'pay_' + Date.now() + Math.random().toString(36).substr(2, 5);
    const row = document.createElement('tr');
    row.id = rowId;
    row.className = 'payment-row';
    row.style.borderBottom = '1px solid var(--border)';
    
    const dDate = data ? data.date : today();
    const dAmtInr = data ? data.amount_inr : 0;
    const dEx = data ? data.ex_rate : (parseFloat(document.getElementById('tr-ex-rate').value) || 83.5);
    const dBank = data ? data.bank_chg : 0;
    const dType = data ? data.type : 'Bank';
    const dRem = data ? data.remarks : '';
    
    row.innerHTML = `
        <td style="padding:8px;"><input type="date" value="${dDate}" oninput="updatePaymentSummary()"></td>
        <td style="padding:8px;"><input type="number" value="${dAmtInr}" placeholder="Amt INR" oninput="updatePaymentSummary()"></td>
        <td style="padding:8px;"><input type="number" value="${dEx}" step="0.01" placeholder="Rate" oninput="updatePaymentSummary()"></td>
        <td style="padding:8px;"><input type="number" value="${dBank}" placeholder="Charges" oninput="calcTradeTotals()"></td>
        <td style="padding:8px;">
            <select onchange="updatePaymentSummary()">
                <option ${dType==='Bank'?'selected':''}>Bank</option>
                <option ${dType==='Yard'?'selected':''}>Yard</option>
            </select>
        </td>
        <td style="padding:8px;"><input type="text" value="${dRem}" placeholder="Ref/Remark" style="width:100%"></td>
        <td style="padding:8px; text-align:center;"><button class="btn btn-sm btn-ghost" onclick="removePaymentRow('${rowId}')" style="color:var(--red)">&#x2715;</button></td>
    `;
    tbody.appendChild(row);
    updatePaymentSummary();
}

function removePaymentRow(id) {
    const row = document.getElementById(id);
    if (row) row.remove();
    updatePaymentSummary();
    calcTradeTotals();
}

function updatePaymentSummary() {
    const rows = document.querySelectorAll('#tr-payments-body tr');
    const mainCurr = document.getElementById('tr-imp-curr').value;
    const univRate = parseFloat(document.getElementById('tr-pay-univ-rate').value) || 3.6725;
    
    let totalInMainCurr = 0;
    let totalBankINR = 0;
    
    rows.forEach(row => {
        const inputs = row.querySelectorAll('input');
        const amtInr = parseFloat(inputs[1].value) || 0;
        const exRate = parseFloat(inputs[2].value) || 1;
        const bank = parseFloat(inputs[3].value) || 0;
        totalBankINR += bank;
        if (exRate > 0) totalInMainCurr += (amtInr / exRate);
    });
    
    // Calculate Dual Totals
    let totalUSD = 0, totalAED = 0;
    if (mainCurr === 'USD') {
        totalUSD = totalInMainCurr;
        totalAED = totalUSD * univRate;
    } else {
        totalAED = totalInMainCurr;
        totalUSD = totalAED / univRate;
    }
    
    document.getElementById('tr-pay-total-dual').innerHTML = `
        <span style="color:var(--text)">USD ${totalUSD.toLocaleString('en-US',{minimumFractionDigits:2})}</span>
        <span style="color:var(--muted)">AED ${totalAED.toLocaleString('en-US',{minimumFractionDigits:2})}</span>
    `;
    document.getElementById('tr-pay-total-bank').textContent = '₹ ' + totalBankINR.toLocaleString('en-IN');
    
    // Balance calculation
    const qty = parseFloat(document.getElementById('tr-vol').value) || 0;
    const rate = parseFloat(document.getElementById('tr-imp-rate').value) || 0;
    const totalDueInMain = qty * rate;
    const balInMain = totalDueInMain - totalInMainCurr;
    
    let balUSD = 0, balAED = 0;
    if (mainCurr === 'USD') {
        balUSD = balInMain;
        balAED = balUSD * univRate;
    } else {
        balAED = balInMain;
        balUSD = balAED / univRate;
    }
    
    const balEl = document.getElementById('tr-pay-balance-dual');
    balEl.innerHTML = `
        <span style="color:${balUSD > 0.05 ? 'var(--red)' : 'var(--green)'}">Bal: USD ${balUSD > 0 ? balUSD.toLocaleString('en-US',{minimumFractionDigits:2}) : '0.00'}</span>
        <span style="color:var(--muted); font-size:9px;">Bal: AED ${balAED > 0 ? balAED.toLocaleString('en-US',{minimumFractionDigits:2}) : '0.00'}</span>
    `;
    
    if (balInMain <= 0.05 && totalDueInMain > 0) {
        document.getElementById('tr-payment-status').style.display = 'block';
    } else {
        document.getElementById('tr-payment-status').style.display = 'none';
    }
}

function getSupplierPayments() {
    const rows = document.querySelectorAll('#tr-payments-body tr');
    const payments = [];
    rows.forEach(row => {
        const inputs = row.querySelectorAll('input');
        const select = row.querySelector('select');
        payments.push({
            date: inputs[0].value,
            amount_inr: parseFloat(inputs[1].value) || 0,
            ex_rate: parseFloat(inputs[2].value) || 0,
            bank_chg: parseFloat(inputs[3].value) || 0,
            type: select.value,
            remarks: inputs[4].value
        });
    });
    return payments;
}

function clearSupplierData() {
    const body = document.getElementById('tr-payments-body');
    if (body) body.innerHTML = '';
    currentShipDocs = [];
    currentTradeDocs = [];
    document.querySelectorAll('.ship-doc-item').forEach(i => {
        i.classList.remove('active');
    });
    renderShipDocs();
    renderTradeDocs();
    updatePaymentSummary();
}

// --- BUYER PAYMENTS ---
function addBuyerPaymentRow(data) {
    const tbody = document.getElementById('tr-buyer-payments-body');
    if (!tbody) return;
    const rowId = 'bpay_' + Date.now() + Math.random().toString(36).substr(2, 5);
    const row = document.createElement('tr');
    row.id = rowId;
    row.className = 'buyer-payment-row';
    row.style.borderBottom = '1px solid var(--border)';
    
    const dDate = data ? data.date : today();
    const dAmt = data ? data.amount : 0;
    const dType = data ? data.type : 'Bank';
    const dRem = data ? data.remarks : '';
    
    row.innerHTML = `
        <td style="padding:8px;"><input type="date" value="${dDate}" oninput="updateBuyerPaymentSummary()"></td>
        <td style="padding:8px;"><input type="number" value="${dAmt}" placeholder="Amount" oninput="updateBuyerPaymentSummary()"></td>
        <td style="padding:8px;">
            <select onchange="updateBuyerPaymentSummary()">
                <option ${dType==='Bank'?'selected':''}>Bank</option>
                <option ${dType==='Yard'?'selected':''}>Yard</option>
            </select>
        </td>
        <td style="padding:8px;"><input type="text" value="${dRem}" placeholder="Ref/Remark" style="width:100%"></td>
        <td style="padding:8px; text-align:center;"><button class="btn btn-sm btn-ghost" onclick="removeBuyerPaymentRow('${rowId}')" style="color:var(--red)">&#x2715;</button></td>
    `;
    tbody.appendChild(row);
    updateBuyerPaymentSummary();
}

function removeBuyerPaymentRow(id) {
    const row = document.getElementById(id);
    if (row) row.remove();
    updateBuyerPaymentSummary();
}

function updateBuyerPaymentSummary() {
    const rows = document.querySelectorAll('#tr-buyer-payments-body tr');
    const invAmtEl = document.getElementById('tr-sale-inv-amt');
    if (!invAmtEl) return;
    const invAmt = parseFloat(invAmtEl.value) || 0;
    
    let totalRec = 0;
    rows.forEach(row => {
        const inputs = row.querySelectorAll('input');
        totalRec += parseFloat(inputs[1].value) || 0;
    });
    
    const recEl = document.getElementById('tr-buy-total-rec');
    if (recEl) recEl.textContent = '₹ ' + totalRec.toLocaleString('en-IN');
    
    const balEl = document.getElementById('tr-buy-balance');
    if (balEl) {
        const balance = invAmt - totalRec;
        balEl.textContent = '₹ ' + balance.toLocaleString('en-IN');
        balEl.style.color = balance > 0 ? 'var(--red)' : 'var(--green)';
    }
}

function getBuyerPayments() {
    const rows = document.querySelectorAll('#tr-buyer-payments-body tr');
    const payments = [];
    rows.forEach(row => {
        const inputs = row.querySelectorAll('input');
        const select = row.querySelector('select');
        payments.push({
            date: inputs[0].value,
            amount: parseFloat(inputs[1].value) || 0,
            type: select.value,
            remarks: inputs[2].value
        });
    });
    return payments;
}

function clearBuyerData() {
    const body = document.getElementById('tr-buyer-payments-body');
    if (body) body.innerHTML = '';
    const invAmtEl = document.getElementById('tr-sale-inv-amt');
    if (invAmtEl) invAmtEl.value = '';
    updateBuyerPaymentSummary();
}

function loadDealDetails() {
    var id = document.getElementById('tr-sale-deal').value;
    if (!id) return;
    var order = state.orders.find(function(o){ return o.id === id; });
    if (!order) return;
    
    // Fill basic fields
    document.getElementById('tr-product').value = order.product;
    document.getElementById('tr-density').value = order.density || 0.850;
    
    // Sync Unit and Values
    const unitEl = document.getElementById('tr-unit');
    const isKG = order.unit === 'KG';
    if (unitEl) unitEl.value = isKG ? 'KG' : 'LITRE';
    
    document.getElementById('tr-vol').value = isKG ? (order.qty_kg || (order.qty * (order.density || 0.850))) : order.qty;
    
    // Fill Sale Rate (Local Sale specific)
    const rateEl = document.getElementById('tr-price-local');
    if (rateEl) {
        rateEl.value = isKG ? (order.price_kg || (order.price / (order.density || 0.850))) : order.price;
    }
    
    // Select the correct party
    const partySel = document.getElementById('tr-party-select');
    if (partySel) {
        // Find option by text matching customer name
        const options = Array.from(partySel.options);
        const target = options.find(function(o){ return o.text === order.customer; });
        if (target) {
            partySel.value = target.value;
        } else {
            // Fallback to text input if select not found
            const partyInput = document.getElementById('tr-party');
            if (partyInput) partyInput.value = order.customer;
        }
    }
    
    // Set Sale Invoice Amount
    const invAmtEl = document.getElementById('tr-sale-inv-amt');
    if (invAmtEl) {
        const qty = isKG ? (order.qty_kg || (order.qty * (order.density || 0.850))) : order.qty;
        const rate = isKG ? (order.price_kg || (order.price / (order.density || 0.850))) : order.price;
        invAmtEl.value = (qty * rate).toFixed(2);
    }
    
    // Trigger UI updates
    populateSourceLocations();
    calcTradeTotals();
    updateBuyerPaymentSummary();
    
    toast('Loaded Order: ' + id + ' (' + (isKG ? 'KG' : 'Litre') + ' basis)');
}

function populateSourceLocations() {
    const sel = document.getElementById('tr-source-loc');
    const product = document.getElementById('tr-product').value;
    if (!sel || !product) return;
    
    // Get unique locations from inventory for this product
    const locations = state.inventory
        .filter(i => i.product === product)
        .map(i => i.location);
    
    const uniqueLocs = [...new Set(locations)].filter(l => l);
    
    sel.innerHTML = '<option value="">-- Select Source --</option>' + 
        uniqueLocs.map(l => {
            const tank = state.tanks.find(t => t.id === l);
            const label = tank ? (tank.name + ' (' + tank.location + ')') : l;
            return '<option value="'+l+'">'+escH(label)+'</option>';
        }).join('');
}

function checkSourceStock() {
    const loc = document.getElementById('tr-source-loc').value;
    const product = document.getElementById('tr-product').value;
    const infoEl = document.getElementById('tr-avail-stock');
    
    if (!loc || !product) {
        infoEl.style.display = 'none';
        return;
    }
    
    const relevant = state.inventory.filter(i => i.product === product && i.location === loc);
    const total = relevant.reduce((sum, i) => sum + i.vol, 0);
    
    infoEl.textContent = 'Avail: ' + fmtN(total.toFixed(0)) + ' L';
    infoEl.style.display = 'block';
    
    if (total <= 0) infoEl.style.color = 'var(--red)';
    else infoEl.style.color = 'var(--teal)';
}


function syncWeightToQty() {
    var netWeight = parseFloat(document.getElementById('tr-net-weight').value) || 0;
    var density = parseFloat(document.getElementById('tr-density').value) || 0.850;
    var unit = document.getElementById('tr-unit').value;
    var qtyInput = document.getElementById('tr-vol');
    
    if (netWeight === 0) return;

    if (unit === 'KG') {
        qtyInput.value = netWeight.toFixed(2);
    } else if (unit === 'LITRE') {
        if (density > 0) {
            qtyInput.value = (netWeight / density).toFixed(0);
        }
    } else if (unit === 'MTON') {
        qtyInput.value = (netWeight / 1000).toFixed(3);
    }
    
    // Trigger total calculations
    if (typeof calcTradeTotals === 'function') calcTradeTotals();
    if (typeof calcImportTotal === 'function') calcImportTotal();
}

/* ═══════ HIGH SEAS DOCUMENT GENERATION ═══════ */
function openHssModal() {
    const buyId = document.getElementById('tr-party').value;
    const buyer = state.buyers.find(b => b.id === buyId);
    if (buyer) {
        document.getElementById('hss-p-iec').value = buyer.iec || '';
    }
     // Prepare Trade Object
    var trade = {
        id: state.nextTradeId++,
        type: type,
        product: product,
        party: party,
        vol: vol,
        price: price,
        date: date,
        terms: terms,
        density: density,
        raw_qty: rawQty,
        unit: unit,
        hss: isHss,
        ship_docs: Object.assign({}, currentShipDocs),
        expenses: JSON.parse(JSON.stringify(currentTradeExpenses)),
        location: document.getElementById('tr-storage-loc').value
    };

    // If Import/Local Purchase and not HSS, update Yard Inventory
    if (type === 'Buy' && !isHss) {
        var weightKg = toKG(vol, density);
        state.inventory.push({
            id: state.nextInvId++,
            trade_id: trade.id,
            product: product,
            vol: vol,
            density: density,
            weight_kg: weightKg,
            location: trade.location,
            date: date
        });
    }

    if (isHss) {
        trade.hss_purchase_rate = parseFloat(document.getElementById('hss-purchase-rate').value) || 0;
        trade.hss_currency = document.getElementById('hss-currency').value;
        trade.hss_ex_rate = parseFloat(document.getElementById('hss-ex-rate').value) || 1;
        trade.hss_bl_no = document.getElementById('hss-bl-no').value;
        trade.hss_vessel = document.getElementById('hss-vessel').value;
        trade.hss_port_loading = document.getElementById('hss-port-loading').value;
        trade.hss_port_discharge = document.getElementById('hss-port-discharge').value;
        trade.hss_agent = document.getElementById('hss-agent').value;
        trade.hss_containers = document.getElementById('hss-containers').value;
        trade.hss_hs_code = document.getElementById('hss-hs-code').value;
        trade.hss_net_weight = parseFloat(document.getElementById('hss-net-weight').value) || 0;
    }
    document.getElementById('hssModal').classList.add('show');
    renderHssPreviews();
}

function closeHssModal() {
    document.getElementById('hssModal').classList.remove('show');
}

function renderHssPreviews() {
    const qty = parseFloat(document.getElementById('tr-vol').value) || 0;
    const rate = parseFloat(document.getElementById('tr-imp-rate').value) || 0;
    const ex = parseFloat(document.getElementById('tr-ex-rate').value) || 1;
    const profitPct = parseFloat(document.getElementById('hss-profit').value) || 2.0;
    const product = document.getElementById('tr-prod').value;
    const seller = document.getElementById('tr-hs-seller').value;
    const buyerId = document.getElementById('tr-party').value;
    const buyerObj = state.buyers.find(b => b.id === buyerId) || {name: buyerId, address: ''};
    const vessel = document.getElementById('tr-vessel').value;
    const blNo = document.getElementById('tr-bl-no').value;
    const curr = document.getElementById('tr-imp-curr').value;
    const invNo = document.getElementById('hss-inv-no').value;
    const pIec = document.getElementById('hss-p-iec').value;

    const cifValFor = qty * rate;
    const cifValInr = cifValFor * ex;
    const profitAmt = (cifValInr * profitPct) / 100;
    const saleConsideration = cifValInr + profitAmt;

    const previews = document.getElementById('hss-previews');
    previews.innerHTML = `
        <div class="hss-print-page" id="hss-p1">
            <h1>HIGH SEAS SALE AGREEMENT</h1>
            <table class="no-border">
                <tr><td>1. NAME & ADDRESS OF IMPORTER</td><td>: MURJI RAVJI AND COMPANY</td></tr>
                <tr><td>2. IMPORT EXPORT CODE NUMBER</td><td>: ABRFM5531E</td></tr>
                <tr><td>3. NAME & ADDRESS OF PURCHASER</td><td>: ${buyerObj.name}</td></tr>
                <tr><td>4. IMPORT EXPORT CODE NUMBER</td><td>: ${pIec}</td></tr>
                <tr><td>5. DESCRIPTION OF GOODS SOLD</td><td>: ${product}</td></tr>
                <tr><td>6. QUANTITY</td><td>: ${(qty/1000).toFixed(2)} MT</td></tr>
                <tr><td>7. NAME & ADDRESS OF SUPPLIER</td><td>: ${seller}</td></tr>
                <tr><td>8. INVOICE NO & DATE</td><td>: ${invNo} DT: ${today()}</td></tr>
                <tr><td>9. NAME OF THE VESSEL</td><td>: ${vessel}</td></tr>
                <tr><td>10. BILL OF LANDING NO. & DATE</td><td>: ${blNo}</td></tr>
                <tr><td>11. VALUE OF CONSIGNMENT</td><td>: ${curr} ${cifValFor.toLocaleString()}</td></tr>
                <tr><td>12. SALE CONSIDERATION</td><td>: INR ${saleConsideration.toLocaleString()} (CIF VALUE + ${profitPct}% PROFIT)</td></tr>
            </table>
            <p style="margin-top:20px; font-size:11px;">13. PAYMENT: Payment should be made to the seller as per high seas sale debit note...</p>
            <p style="font-size:11px;">14. DELIVERY: All the right and the title of the goods will be transferred from sellers to the buyer...</p>
            <div class="signature-row">
                <div>For, MURJI RAVJI AND COMPANY<br><br><br>Authorized Signatory</div>
                <div>For, ${buyerObj.name}<br><br><br>Authorized Signatory</div>
            </div>
        </div>

        <div class="hss-print-page" id="hss-p2">
            <div class="letterhead">
                <h3>MURJI RAVJI AND COMPANY</h3>
                <p>Shop No. 410, Plot No. DHH, Sector 12, Prime Mall, Kutch, Gandhidham, Gujarat 370201</p>
                <p>GSTIN: 27ABRFM5531F1ZJ | IEC: ABRFM5531E</p>
            </div>
            <h2 style="text-decoration:none;">HIGH SEAS INVOICE</h2>
            <div style="display:flex; justify-content:space-between; margin-bottom:15px; font-size:12px;">
                <div><strong>Bill To:</strong><br>${buyerObj.name}<br>${buyerObj.city || ''}</div>
                <div>Invoice No: ${invNo}<br>Date: ${today()}</div>
            </div>
            <table>
                <thead><tr style="background:#f4f4f4;"><th>Description of Goods</th><th>Quantity</th><th>Rate</th><th>Amount (INR)</th></tr></thead>
                <tbody>
                    <tr><td>${product}<br><small>FOR INDUSTRIAL USE ONLY</small></td><td>${qty.toLocaleString()} KG</td><td>${(saleConsideration/qty).toFixed(2)}</td><td>${saleConsideration.toLocaleString()}</td></tr>
                    <tr style="font-weight:bold;"><td colspan="3" style="text-align:right;">High Seas Commission (Round Off)</td><td>INC.</td></tr>
                    <tr style="font-weight:bold; background:#f4f4f4;"><td colspan="3" style="text-align:right;">Total Value</td><td>INR ${saleConsideration.toLocaleString()}</td></tr>
                </tbody>
            </table>
            <p style="font-size:11px; margin-top:10px;">Amount in words: INR ${saleConsideration.toFixed(0)} Only</p>
            <div class="signature-row" style="margin-top:40px;">
                <div style="border:1px solid #ccc; padding:10px; width:200px; height:80px; font-size:10px;">Receiver's Signature</div>
                <div style="text-align:right;">For, MURJI RAVJI AND COMPANY<br><br><br>Authorized Signatory</div>
            </div>
        </div>

        <div class="hss-print-page" id="hss-p3">
            <div class="letterhead">
                <h3>MURJI RAVJI AND COMPANY</h3>
                <p>Oil Trading & Logistics | Gandhidham, India</p>
            </div>
            <div style="text-align:right; margin-bottom:20px;">DATE: ${today()}</div>
            <p>TO,<br>The Asstt. / Dy. Commissioner of Customs<br>Import Section<br>Mundra Port Mundra, India.</p>
            <p style="margin-top:20px;">Sub: <strong>HIGH SEAS PURCHASE LETTER</strong></p>
            <p>Ref: Cargo Description: ${product}<br>NET WEIGHT: ${qty.toLocaleString()} KG<br>B/L NO: ${blNo}</p>
            <p style="margin-top:20px;">Dear Sir,<br>With reference to the above subject, we wish to inform that we have purchased ${product} on high seas sales as per the High Seas Purchase Agreement enclosed.</p>
            <p>The subject consignment is covered under Bill of Lading No: ${blNo}</p>
            <p>Kindly do the need full and oblige. Thanking you.</p>
            <div class="signature-row" style="margin-top:80px;">
                <div>Yours faithfully,<br>For, MURJI RAVJI AND COMPANY<br><br><br>(Authorized Signatory)</div>
            </div>
        </div>
    `;
}

async function downloadAllHssDocs() {
    const container = document.getElementById('hss-print-container');
    container.innerHTML = document.getElementById('hss-previews').innerHTML;
    
    const opt = {
        margin: [10, 5],
        filename: 'High_Seas_Docs_' + Date.now() + '.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, letterRendering: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
    };

    toast('Generating PDFs... Please wait.');
    setTimeout(() => {
        html2pdf().set(opt).from(container).save().then(() => {
            toast('High Seas Set Downloaded');
        });
    }, 500);
}

/* ═══════ YARD & TANK MANAGEMENT ═══════ */
    
/* ═══════ YARD MANAGER & TANK LOGIC ═══════ */
function renderYardDashboard() {
    const grid = document.getElementById('yard-grid');
    if (!grid || !state) return;
    
    grid.innerHTML = (state.tanks || []).map(tank => {
        const relevant = (state.inventory || []).filter(i => i.location === tank.id);
        const currentL = relevant.reduce((sum, i) => sum + i.vol, 0);
        const products = [...new Set(relevant.filter(i => i.vol > 0).map(i => i.product))];
        const mainProd = products.length > 0 ? products[0] : 'EMPTY';
        const pct = Math.min(100, Math.max(0, (currentL / tank.capacity) * 100));
        const color = pct > 90 ? '#ef4444' : pct > 75 ? '#f59e0b' : '#14b8a6';
        
        return `
            <div class="panel" style="border-top: 4px solid ${color};">
                <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                    <b>${escH(tank.name)}</b>
                    <span style="color:${color}; font-weight:bold;">${pct.toFixed(1)}%</span>
                </div>
                <div style="background:rgba(255,255,255,0.05); height:80px; position:relative; border-radius:4px; overflow:hidden; border:1px solid var(--border);">
                    <div style="position:absolute; bottom:0; width:100%; height:${pct}%; background:${color}44;"></div>
                    <div style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; flex-direction:column; gap:2px;">
                        <div style="font-size:16px; font-weight:bold;">${fmtN(currentL.toFixed(0))} L</div>
                        <div style="font-size:12px; font-weight:bold; color:var(--teal);">${fmtN((currentL * 0.850).toFixed(1))} KG</div>
                    </div>
                </div>
                <div style="font-size:10px; margin-top:5px; color:var(--muted); display:flex; justify-content:space-between;">
                    <span>${mainProd}</span>
                    <span>${escH(tank.location)}</span>
                </div>
            </div>
        `;
    }).join('');
}

function renderTankManager() {
    const tbody = document.getElementById('tankManagerTable');
    if (!tbody || !state) return;
    
    tbody.innerHTML = (state.tanks || []).map(t => `
        <tr>
            <td class="mono">${t.id}</td>
            <td style="font-weight:bold;">${escH(t.name)}</td>
            <td>${escH(t.location)}</td>
            <td class="mono">${fmtN(t.capacity)} L</td>
            <td><button class="btn btn-sm btn-ghost" onclick="deleteTank('${t.id}')" style="color:var(--red)">&#x2715;</button></td>
        </tr>
    `).join('');
    
    // Update Trade Storage Dropdown
    const locSelect = document.getElementById('tr-storage-loc');
    const srcSelect = document.getElementById('tr-source-loc');
    if (locSelect) {
        let html = '<option value="">-- Direct Sale / Other --</option>';
        (state.tanks || []).forEach(t => {
            html += `<option value="${t.id}">${t.name} (${fmtN(t.capacity)} L)</option>`;
        });
        locSelect.innerHTML = html;
        if (srcSelect) srcSelect.innerHTML = html.replace('-- Direct Sale / Other --', '-- Select Source --');
    }
}

function addTank() {
    if (!state.tanks) state.tanks = [];
    const name = document.getElementById('new-tank-name').value;
    let cap = parseFloat(document.getElementById('new-tank-cap').value);
    const capKG = parseFloat(document.getElementById('new-tank-cap-kg').value);
    const capMT = parseFloat(document.getElementById('new-tank-cap-mt').value);
    const loc = document.getElementById('new-tank-loc').value || 'Main Yard';
    
    if (capKG && !cap) cap = capKG / 0.850;
    if (capMT && !cap) cap = (capMT * 1000) / 0.850;

    if (!name || !cap) return toast('Enter name and capacity', true);
    
    const id = 'T' + (state.tanks.length + 1);
    state.tanks.push({ id, name, capacity: cap, location: loc });
    
    document.getElementById('new-tank-name').value = '';
    document.getElementById('new-tank-cap').value = '';
    document.getElementById('new-tank-cap-kg').value = '';
    document.getElementById('new-tank-cap-mt').value = '';
    
    saveState();
    renderTankManager();
    renderYardDashboard();
    toast('New Tank Registered');
}

function deleteTank(id) {
    if (!confirm('Remove this tank?')) return;
    state.tanks = state.tanks.filter(t => t.id !== id);
    saveState();
    renderTankManager();
    renderYardDashboard();
}

async function forceCloudResync() {
    if (!confirm('This will clear your local cache and reload ALL data from the Cloud. Any unsaved local changes will be lost. Proceed?')) return;
    
    toast('Clearing cache and re-syncing...');
    localStorage.removeItem('murji_oil_v12');
    
    // Force reload
    window.location.reload();
}

async function inspectCloudData() {
    try {
        const { data: auth } = await supabaseClient.auth.getSession();
        if (!auth.session) return alert("Please Login first to inspect cloud data.");
        
        toast("Checking cloud database...");
        const { data, error } = await supabaseClient
            .from('murji_state')
            .select('state_data')
            .eq('user_id', auth.session.user.id)
            .maybeSingle();
            
        if (error) throw error;
        if (!data || !data.state_data) return alert("No cloud data found for this user account.");
        
        const tradeCount = data.state_data.trades ? data.state_data.trades.length : 0;
        const tankCount = data.state_data.tanks ? data.state_data.tanks.length : 0;
        
        alert(`CLOUD DATABASE CHECK:\n\n✅ Data Found!\n- Total Trades: ${tradeCount}\n- Storage Tanks: ${tankCount}\n- Products: ${data.state_data.products.length}\n\nIf you see your trades here, your data is SAFE. Click 'FORCE CLOUD RESYNC' to restore them to your screen.`);
    } catch (e) {
        console.error(e);
        alert("Error connecting to cloud: " + e.message);
    }
}

async function deepRecoveryScan() {
    toast("Starting Deep Recovery Scan...");
    const keys = Object.keys(localStorage);
    let foundData = null;
    let foundKey = null;

    // Search for any key that looks like our data
    for (let key of keys) {
        try {
            const val = localStorage.getItem(key);
            if (val && (val.includes('"trades"') || val.includes('"products"'))) {
                const parsed = JSON.parse(val);
                if (parsed.trades && parsed.trades.length > 0) {
                    if (!foundData || parsed.trades.length > foundData.trades.length) {
                        foundData = parsed;
                        foundKey = key;
                    }
                }
            }
        } catch (e) {}
    }

    if (foundData) {
        if (confirm(`SUCCESS! Found ${foundData.trades.length} trades in backup key: [${foundKey}].\n\nWould you like to RESTORE this data now?`)) {
            state = foundData;
            saveState(true);
            initApp();
            toast("Data Restored Successfully!");
        }
    } else {
        alert("Deep Scan Complete: No additional backups found in this browser. Please ensure you are logged into the correct Cloud account.");
    }
}

/* ═══════ STORAGE & BACKUP ═══════ */
async function initializeStorage(isManual = false) {
    try {
        if (isManual) toast("Initializing Cloud Storage...");
        const { data, error } = await supabaseClient.storage.createBucket('murji_docs', {
            public: true,
            fileSizeLimit: 5242880, // 5MB
            allowedMimeTypes: ['image/jpeg', 'image/png', 'application/pdf']
        });
        
        if (error) {
            console.warn("Storage Init Note:", error.message);
            if (isManual && !error.message.includes('already exists')) {
                toast("Note: Storage bucket must be created in Supabase Dashboard if auto-init fails.", true);
            } else if (isManual && error.message.includes('already exists')) {
                toast("Storage Already Active");
            }
            return;
        }
        if (isManual) toast("Cloud Storage Ready!");
    } catch (e) {
        console.error("Storage Init Error:", e.message);
        if (isManual) toast("Note: Storage bucket must be created in Supabase Dashboard if auto-init fails.", true);
    }
}

async function uploadFileToSupabase(file, path) {
    const { data: auth } = await supabaseClient.auth.getSession();
    if (!auth.session) throw new Error("Please Login to upload documents.");
    
    const fileName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
    const fullPath = `${auth.session.user.id}/${path}/${fileName}`;
    
    const { data, error } = await supabaseClient.storage
        .from('murji_docs')
        .upload(fullPath, file);
        
    if (error) throw error;
    
    const { data: urlData } = supabaseClient.storage
        .from('murji_docs')
        .getPublicUrl(fullPath);
        
    return urlData.publicUrl;
}

function exportStateToFile() {
    const dataStr = JSON.stringify(state, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Murji_Backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast("Database Exported to Downloads");
}

function importStateFromFile(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const imported = JSON.parse(e.target.result);
            if (!imported.trades) throw new Error("Invalid backup file format.");
            if (confirm(`Restore ${imported.trades.length} trades from backup? This will overwrite current data.`)) {
                state = imported;
                saveState(true);
                initApp();
                toast("Database Restored Successfully!");
            }
        } catch (err) {
            alert("Error importing file: " + err.message);
        }
    };
    reader.readAsText(file);
}

/* ═══════ LANDED COST REPORT (EXCEL STYLE) ═══════ */
function generateLandedCostReport(tradeId) {
    const t = state.trades.find(x => x.id === tradeId);
    if (!t) return toast('Trade not found', true);

    // FIX: Use raw quantity and correct import rates
    const q = parseFloat(t.raw_qty) || (t.vol / (t.density || 0.85)); // Fallback to calculation if raw_qty missing
    const unit = t.unit || 'L';
    const usdRate = parseFloat(t.imp_rate) || 0;
    const exRate = parseFloat(t.ex_rate) || 1;
    const foreignLabel = t.currency || 'USD';

    // Calculate Financials correctly
    const foreignAmt = q * usdRate;
    const basicInr = q * (usdRate * exRate);
    
    const expenses = t.expenses || [];
    const expNetTotal = expenses.reduce((s, e) => s + (parseFloat(e.net_amount) || 0), 0);
    const expTaxTotal = expenses.reduce((s, e) => s + (parseFloat(e.tax_amount) || 0), 0);
    const expGrandTotal = expenses.reduce((s, e) => s + (parseFloat(e.total_amount) || 0), 0);
    
    // Also include Bank Charges from payments if any
    const bankCharges = (t.payments || []).reduce((s, p) => s + (parseFloat(p.bank_charges) || 0), 0);
    const tankCost = parseFloat(t.tank_cost) || 0;
    
    // Total INR should be the exact sum of all components
    const totalPurchaseCost = basicInr + expGrandTotal + bankCharges + tankCost;
    
    // Total KG for Landed Rate calculation
    const totalKG = (unit === 'KG') ? q : (unit === 'MTON' ? q * 1000 : q * (t.density || 0.85));
    
    const basicRateKG = totalKG > 0 ? (basicInr / totalKG) : 0;
    const expRateKG = totalKG > 0 ? ((expGrandTotal + bankCharges + tankCost) / totalKG) : 0;
    const finalLandedKG = basicRateKG + expRateKG;

    const html = `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; color: #333; padding: 10px;">
            <!-- Header (kept same) -->
            <div style="display: flex; justify-content: space-between; border-bottom: 2px solid #14b8a6; padding-bottom: 10px; margin-bottom: 20px;">
                <div>
                    <h1 style="margin: 0; color: #14b8a6; font-size: 24px;">MURJI RAVJI & COMPANY</h1>
                    <p style="margin: 2px 0; font-size: 12px; color: #666;">IMPORT SETTLEMENT & LANDED COST STATEMENT</p>
                </div>
                <div style="text-align: right;">
                    <p style="margin: 0; font-weight: bold;">Date: ${t.date}</p>
                    <p style="margin: 2px 0; font-size: 11px;">Ref: TR-${t.id}</p>
                </div>
            </div>

            <!-- Top Details Grid (kept same) -->
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 12px;">
                <tr>
                    <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold; background: #f9f9f9; width: 20%;">EXPORTER NAME</td>
                    <td style="padding: 8px; border: 1px solid #ddd; width: 30%;">${escH(t.party) || 'NA'}</td>
                    <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold; background: #f9f9f9; width: 20%;">INVOICE NO</td>
                    <td style="padding: 8px; border: 1px solid #ddd; width: 30%;">${escH(t.inv_no_intl) || 'NA'}</td>
                </tr>
                <tr>
                    <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold; background: #f9f9f9;">B/L NO</td>
                    <td style="padding: 8px; border: 1px solid #ddd;">${escH(t.bl_no) || 'NA'}</td>
                    <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold; background: #f9f9f9;">VESSEL</td>
                    <td style="padding: 8px; border: 1px solid #ddd;">${escH(t.vessel) || 'NA'}</td>
                    <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold; background: #f9f9f9;">MATERIAL</td>
                    <td style="padding: 8px; border: 1px solid #ddd;">${escH(t.product)}</td>
                </tr>
                <tr>
                    <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold; background: #f9f9f9;">B/E NO</td>
                    <td style="padding: 8px; border: 1px solid #ddd;">${escH(t.boe_no) || 'NA'}</td>
                    <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold; background: #f9f9f9;">PORT</td>
                    <td style="padding: 8px; border: 1px solid #ddd;">${escH(t.port_dis) || 'NA'}</td>
                </tr>
            </table>

            <!-- Purchase Calculation (kept same) -->
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px; font-size: 13px; text-align: right;">
                <thead>
                    <tr style="background: #333; color: #fff;">
                        <th style="padding: 10px; text-align: left; border: 1px solid #333;">QUANTITY</th>
                        <th style="padding: 10px; border: 1px solid #333;">RATE (${foreignLabel})</th>
                        <th style="padding: 10px; border: 1px solid #333;">${foreignLabel} AMT</th>
                        <th style="padding: 10px; border: 1px solid #333;">EX RT</th>
                        <th style="padding: 10px; border: 1px solid #333;">INR AMT</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td style="padding: 10px; border: 1px solid #ddd; text-align: left;">${q.toLocaleString()} ${unit}</td>
                        <td style="padding: 10px; border: 1px solid #ddd;">${usdRate.toLocaleString()}</td>
                        <td style="padding: 10px; border: 1px solid #ddd; font-weight: 600;">${foreignAmt.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}</td>
                        <td style="padding: 10px; border: 1px solid #ddd;">${exRate}</td>
                        <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold; color: #14b8a6;">${fmt(basicInr)}</td>
                    </tr>
                </tbody>
            </table>

            <!-- Expenses Section -->
            <h3 style="font-size: 14px; color: #14b8a6; border-bottom: 1px solid #ddd; padding-bottom: 5px; margin-bottom: 15px; letter-spacing: 1px;">IMPORT EXPENSES BREAKDOWN</h3>
            <table style="width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 25px;">
                <thead>
                    <tr style="background: #f4f4f4; text-align: right; font-weight: bold;">
                        <th style="padding: 8px; border: 1px solid #ddd; text-align: left; width: 45%;">PARTICULARS</th>
                        <th style="padding: 8px; border: 1px solid #ddd;">NET AMOUNT</th>
                        <th style="padding: 8px; border: 1px solid #ddd;">PLUS GST/TAX</th>
                        <th style="padding: 8px; border: 1px solid #ddd;">TOTAL INR</th>
                    </tr>
                </thead>
                <tbody>
                    ${expenses.map(e => `
                        <tr style="text-align: right;">
                            <td style="padding: 8px; border: 1px solid #ddd; text-align: left; font-weight: 500;">${escH(e.type)} ${e.ref ? `<br><small style="color:#888;">Ref: ${escH(e.ref)}</small>` : ''}</td>
                            <td style="padding: 8px; border: 1px solid #ddd;">${fmtN(e.net_amount || e.amount)}</td>
                            <td style="padding: 8px; border: 1px solid #ddd;">${fmtN(e.tax_amount || 0)}</td>
                            <td style="padding: 8px; border: 1px solid #ddd; font-weight: 600;">${fmtN(e.total_amount || e.amount)}</td>
                        </tr>
                    `).join('')}
                    ${tankCost > 0 ? `
                        <tr style="text-align: right;">
                            <td style="padding: 8px; border: 1px solid #ddd; text-align: left; font-weight: 500;">Flexi / ISO Tank Cost (${t.container_count || 0} Tanks @ $${fmtN(t.tank_rate || 0)} x ${t.ex_rate || exRate})</td>
                            <td style="padding: 8px; border: 1px solid #ddd;">${fmtN(tankCost)}</td>
                            <td style="padding: 8px; border: 1px solid #ddd;">0.00</td>
                            <td style="padding: 8px; border: 1px solid #ddd; font-weight: 600;">${fmtN(tankCost)}</td>
                        </tr>
                    ` : ''}
                    ${bankCharges > 0 ? `
                        <tr style="text-align: right;">
                            <td style="padding: 8px; border: 1px solid #ddd; text-align: left; font-weight: 500;">Bank Charges (Payments)</td>
                            <td style="padding: 8px; border: 1px solid #ddd;">${fmtN(bankCharges)}</td>
                            <td style="padding: 8px; border: 1px solid #ddd;">0.00</td>
                            <td style="padding: 8px; border: 1px solid #ddd; font-weight: 600;">${fmtN(bankCharges)}</td>
                        </tr>
                    ` : ''}
                    ${(expenses.length === 0 && tankCost === 0 && bankCharges === 0) ? '<tr><td colspan="4" style="padding: 30px; text-align: center; color: #999; font-style: italic;">No logistics expenses recorded for this trade.</td></tr>' : ''}
                </tbody>
                <tfoot>
                    <tr style="background: #f9f9f9; font-weight: bold; text-align: right; font-size: 12px; color: #14b8a6;">
                        <td style="padding: 10px; border: 1px solid #ddd; text-align: left;">EXPENSES GRAND TOTAL</td>
                        <td style="padding: 10px; border: 1px solid #ddd;">${fmtN(expNetTotal + tankCost + bankCharges)}</td>
                        <td style="padding: 10px; border: 1px solid #ddd;">${fmtN(expTaxTotal)}</td>
                        <td style="padding: 10px; border: 1px solid #ddd; border-left: 2px solid #14b8a6;">${fmt(expGrandTotal + tankCost + bankCharges)}</td>
                    </tr>
                </tfoot>
            </table>

            <!-- Final Summary Card -->
            <div style="background: #1e293b; color: #fff; padding: 20px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px;">
                <span style="font-size: 16px; font-weight: bold; letter-spacing: 1px; color: #94a3b8;">TOTAL PURCHASE COST (INR)</span>
                <span style="font-size: 24px; font-weight: bold; color: #fbbf24;">${fmt(totalPurchaseCost)}</span>
            </div>

            <!-- Landed Rate Per KG Footer -->
            <div style="border: 2px solid #ddd; border-radius: 8px; overflow: hidden;">
                <table style="width: 100%; border-collapse: collapse; font-size: 13px; text-align: center;">
                    <tr style="font-weight: bold; text-transform: uppercase; color: #64748b; font-size: 11px; background: #f8fafc;">
                        <td style="padding: 12px; border-right: 1px solid #ddd; width: 33.3%;">BASIC RATE / KG</td>
                        <td style="padding: 12px; border-right: 1px solid #ddd; width: 33.3%;">EXPENSE RATE / KG</td>
                        <td style="padding: 12px; width: 33.3%; background: #fffbeb; color: #b45309;">FINAL LANDED RATE / KG</td>
                    </tr>
                    <tr style="font-size: 20px; font-weight: bold;">
                        <td style="padding: 15px; border-right: 1px solid #ddd; color: #1e293b;">\u20B9 ${basicRateKG.toFixed(2)}</td>
                        <td style="padding: 15px; border-right: 1px solid #ddd; color: #1e293b;">\u20B9 ${expRateKG.toFixed(2)}</td>
                        <td style="padding: 15px; background: #fbbf24; color: #000; border-top: 2px solid #b45309;">\u20B9 ${finalLandedKG.toFixed(2)}</td>
                    </tr>
                </table>
            </div>

            <div style="margin-top: 60px; border-top: 1px solid #eee; padding-top: 20px; text-align: center; font-size: 11px; color: #94a3b8; font-style: italic;">
                Landed Cost Analysis Report • Generated by Murji Oil Dashboard • ${new Date().toLocaleString()}
            </div>
        </div>
    `;

    openPrintWindow(html, `Landed_Cost_${t.bl_no || t.id}`);
}