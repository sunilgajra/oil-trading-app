/**
 * app_ui.js - Combined UI & Complex Trade Logic
 */
import { state, saveState, fmt, fmtN, today, escH, toKG, toast, showImage } from './app_core.js';

export function renderYardDashboard() {
    const grid = document.getElementById('inventory-yard-grid') || document.getElementById('yard-grid');
    if (!grid || !state) return;
    grid.innerHTML = (state.tanks || []).map(tank => {
        const relevant = (state.inventory || []).filter(i => i.location === tank.id);
        const currentL = relevant.reduce((sum, i) => sum + i.vol, 0);
        const pct = Math.min(100, Math.max(0, (currentL / tank.capacity) * 100));
        const color = pct > 90 ? '#ef4444' : pct > 75 ? '#f59e0b' : '#14b8a6';
        return `
            <div class="panel" style="border-top: 4px solid ${color};">
                <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                    <b>${escH(tank.name)}</b>
                    <span style="color:${color}; font-weight:bold;">${pct.toFixed(1)}%</span>
                </div>
                <div style="background:rgba(255,255,255,0.05); height:80px; position:relative; border-radius:4px; overflow:hidden;">
                    <div style="position:absolute; bottom:0; width:100%; height:${pct}%; background:${color}44;"></div>
                    <div style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; flex-direction:column;">
                        <div style="font-weight:bold; font-size:16px;">${fmtN(currentL.toFixed(0))} L</div>
                    </div>
                </div>
                <div style="font-size:10px; margin-top:5px; color:var(--muted); display:flex; justify-content:space-between;">
                    <span>${escH(tank.location)}</span>
                </div>
            </div>`;
    }).join('');
}

export function renderProductsList() {
    const list = document.getElementById('productsList');
    if (!list) return;
    list.innerHTML = (state.products || []).map(p => `
        <div class="doc-badge" style="display:inline-flex; align-items:center; gap:10px; margin:5px; background:var(--surface2); padding:5px 12px; border-radius:20px; border:1px solid var(--border);">
            <span style="font-weight:bold; color:var(--teal);">${escH(p.name)}</span>
            <button onclick="App.deleteProduct('${escH(p.name)}')" style="background:none; border:none; color:var(--red); cursor:pointer;">&times;</button>
        </div>
    `).join('');
}

export function renderTradesTable() {
    const table = document.getElementById('tradesTable');
    if (!table) return;
    table.innerHTML = (state.trades || []).slice().reverse().map(t => `
        <tr>
            <td class="mono">${t.date}</td>
            <td><span class="badge ${t.type === 'Buy' ? 'badge-blue' : 'badge-green'}">${t.type}</span></td>
            <td>${escH(t.product)}</td>
            <td>${escH(t.party)}</td>
            <td class="mono">${fmtN(t.vol)} L</td>
            <td class="mono">${fmt(t.price)}</td>
            <td><button class="btn btn-primary btn-sm" onclick="App.editTrade('${t.id}')">Edit</button></td>
        </tr>`).join('');
}

export function renderInventoryTable() {
    const table = document.getElementById('invTable');
    if (!table) return;
    table.innerHTML = (state.inventory || []).map(i => `
        <tr>
            <td><b>${escH(i.product)}</b></td>
            <td>${escH(i.location)}</td>
            <td class="mono">${fmtN(i.vol)}</td>
            <td class="mono">${fmt(i.cost || 0)}</td>
        </tr>`).join('');
}

// Complex Toggle Logic
export function toggleTradeDetailFields() {
    const type = document.getElementById('tr-type').value;
    const mode = document.getElementById('tr-mode').value;
    
    const buyPay = document.getElementById('tr-payments-section');
    const sellPay = document.getElementById('tr-buyer-payments-section');
    const impFields = document.querySelectorAll('.tr-import-fields');
    const locFields = document.querySelectorAll('.tr-local-fields');
    
    // Visibility
    if (impFields) impFields.forEach(el => el.style.display = (mode === 'import' || mode === 'hs_sale') ? 'grid' : 'none');
    if (locFields) locFields.forEach(el => el.style.display = (mode === 'local') ? 'grid' : 'none');
    
    if (type === 'Buy') {
        if (buyPay) buyPay.style.display = (mode === 'import') ? 'block' : 'none';
        if (sellPay) sellPay.style.display = 'none';
    } else {
        if (buyPay) buyPay.style.display = 'none';
        if (sellPay) sellPay.style.display = (mode === 'local') ? 'block' : 'none';
    }
}

export function toggleTradeModeField() {
    const type = document.getElementById('tr-type').value;
    const modeGrp = document.getElementById('tr-mode-group');
    if (modeGrp) modeGrp.style.display = (type === 'Move') ? 'none' : 'block';
    
    const modeSel = document.getElementById('tr-mode');
    if (type === 'Buy') {
        modeSel.innerHTML = '<option value="local">Local Purchase</option><option value="import">Import Purchase</option>';
    } else {
        modeSel.innerHTML = '<option value="local">Local Sale</option><option value="hs_sale">High Seas Sale</option>';
    }
    toggleTradeDetailFields();
}

// Logic Restored from Old Script
export function syncWeightToQty() {
    const weight = parseFloat(document.getElementById('tr-net-weight').value) || 0;
    const density = parseFloat(document.getElementById('tr-density').value) || 0.850;
    const unit = document.getElementById('tr-unit').value;
    const qtyInput = document.getElementById('tr-vol');
    if (!qtyInput) return;

    if (unit === 'KG') qtyInput.value = weight.toFixed(2);
    else if (unit === 'LITRE') qtyInput.value = (weight / density).toFixed(0);
    else if (unit === 'MTON') qtyInput.value = (weight / 1000).toFixed(3);
    
    calcTradeTotals();
}

export function calcTradeTotals() {
    const qty = parseFloat(document.getElementById('tr-vol').value) || 0;
    const mode = document.getElementById('tr-mode').value;
    const density = parseFloat(document.getElementById('tr-density').value) || 0.850;
    
    let price = 0;
    if (mode === 'import') {
        const rate = parseFloat(document.getElementById('tr-imp-rate').value) || 0;
        const ex = parseFloat(document.getElementById('tr-ex-rate').value) || 1;
        price = rate * ex;
        const totalFor = document.getElementById('tr-total-for');
        if (totalFor) totalFor.value = (qty * rate).toFixed(2);
    } else {
        price = parseFloat(document.getElementById('tr-price-local')?.value) || 0;
    }
    
    const totalINR = qty * price;
    const totalEl = document.getElementById('tr-total-inr-shared');
    if (totalEl) totalEl.value = totalINR.toFixed(2);
    
    // Landed Costs
    const lLit = document.getElementById('tr-landed-l');
    const lKg = document.getElementById('tr-landed-kg');
    if (lLit) lLit.value = price.toFixed(2);
    if (lKg) lKg.value = (price * density).toFixed(2);
}

export function editTrade(id) {
    const t = state.trades.find(x => x.id == id);
    if (!t) return toast("Trade not found", true);
    
    document.getElementById('page-trades').classList.add('active'); // Switch view
    
    document.getElementById('tr-type').value = t.type;
    toggleTradeModeField();
    document.getElementById('tr-mode').value = t.mode || 'local';
    toggleTradeDetailFields();
    
    document.getElementById('tr-product').value = t.product;
    document.getElementById('tr-party').value = t.party;
    document.getElementById('tr-vol').value = t.vol;
    document.getElementById('tr-density').value = t.density;
    document.getElementById('tr-date').value = t.date;
    
    if (t.mode === 'import') {
        document.getElementById('tr-bl-no').value = t.bl_no || '';
        document.getElementById('tr-vessel').value = t.vessel || '';
        document.getElementById('tr-imp-rate').value = t.price || 0;
        document.getElementById('tr-ex-rate').value = t.ex_rate || 85;
    }
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
    toast("Trade details loaded");
}

export async function handleTradeDocUpload(input) {
    const files = Array.from(input.files);
    if (!files.length) return;
    toast("Scanning...");
    // Rest of scanning logic in app_services.js
}

export function populateTradeParties() {
    const sel = document.getElementById('tr-party-select');
    if (!sel) return;
    const parties = [...state.suppliers, ...state.buyers];
    sel.innerHTML = '<option value="">-- Select Party --</option>' + 
        parties.map(p => `<option value="${escH(p.name)}">${escH(p.name)}</option>`).join('');
}
