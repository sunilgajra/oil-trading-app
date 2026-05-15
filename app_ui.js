/**
 * app_ui.js - Combined UI Logic (Trades, Inventory, Dashboard)
 */
import { state, saveState, fmt, fmtN, today, escH, toKG } from './app_core.js';

export function renderYardDashboard() {
    const grid = document.getElementById('inventory-yard-grid');
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
                <div style="background:rgba(255,255,255,0.05); height:60px; position:relative; border-radius:4px; overflow:hidden;">
                    <div style="position:absolute; bottom:0; width:100%; height:${pct}%; background:${color}44;"></div>
                    <div style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-weight:bold;">
                        ${fmtN(currentL.toFixed(0))} L
                    </div>
                </div>
                <div style="font-size:12px; color:var(--muted); margin-top:5px;">${escH(tank.location)}</div>
            </div>`;
    }).join('');
}

export function renderProductsList() {
    const list = document.getElementById('productsList');
    if (!list) return;
    list.innerHTML = (state.products || []).map(p => `
        <div class="doc-badge" style="display:inline-flex; align-items:center; gap:10px; margin:5px; background:var(--surface2); padding:5px 12px; border-radius:20px; border:1px solid var(--border);">
            <span style="font-weight:bold; color:var(--teal);">${escH(p.name)}</span>
            <span style="font-size:11px; color:var(--muted);">${p.density}</span>
            <button onclick="App.deleteProduct('${escH(p.name)}')" style="background:none; border:none; color:var(--red); cursor:pointer; font-weight:bold;">&times;</button>
        </div>
    `).join('');
}

export function renderTradesTable() {
    const table = document.getElementById('tradesTable');
    if (!table) return;
    table.innerHTML = state.trades.slice().reverse().map(t => `
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
    table.innerHTML = state.inventory.map(i => `
        <tr>
            <td><b>${escH(i.product)}</b></td>
            <td>${escH(i.location)}</td>
            <td class="mono">${fmtN(i.vol)}</td>
            <td class="mono">${fmt(i.unit_cost || 0)}</td>
        </tr>`).join('');
}

export function toggleTradeDetailFields() {
    const type = document.getElementById('tr-type').value;
    const mode = document.getElementById('tr-mode').value;
    
    // Groups
    const buySec = document.getElementById('tr-payments-section');
    const sellSec = document.getElementById('tr-buyer-payments-section');
    const impFields = document.querySelectorAll('.tr-import-fields');
    const locFields = document.querySelectorAll('.tr-local-fields');
    
    // Toggle Visibility
    if (impFields) impFields.forEach(el => el.style.display = (mode === 'import' || mode === 'hs_sale') ? 'grid' : 'none');
    if (locFields) locFields.forEach(el => el.style.display = (mode === 'local') ? 'grid' : 'none');
    
    if (type === 'Buy') {
        if (buySec) buySec.style.display = (mode === 'import') ? 'block' : 'none';
        if (sellSec) sellSec.style.display = 'none';
    } else {
        if (buySec) buySec.style.display = 'none';
        if (sellSec) sellSec.style.display = (mode === 'local') ? 'block' : 'none';
    }
}

export function toggleTradeModeField() {
    const type = document.getElementById('tr-type').value;
    const modeGrp = document.getElementById('tr-mode-group');
    if (modeGrp) modeGrp.style.display = (type === 'Move') ? 'none' : 'block';
}

export function populatePurchaseLinks() {
    const sel = document.getElementById('tr-link-purchase');
    if (!sel) return;
    const buys = state.trades.filter(t => t.type === 'Buy' && t.mode === 'import');
    sel.innerHTML = '<option value="">-- Link to Import Purchase --</option>' + 
        buys.map(t => `<option value="${t.id}">${escH(t.id + ' | ' + t.party + ' | ' + t.product)}</option>`).join('');
}

export function populateTradeProducts() {
    const sel = document.getElementById('tr-product');
    if (!sel) return;
    sel.innerHTML = state.products.map(p => `<option value="${escH(p.name)}">${escH(p.name)}</option>`).join('');
}

export function populateTradeParties() {
    const sel = document.getElementById('tr-party-select');
    if (!sel) return;
    const parties = [...new Set([...state.suppliers.map(s => s.name), ...state.buyers.map(b => b.name)])];
    sel.innerHTML = '<option value="">-- Select Party --</option>' + 
        parties.map(p => `<option value="${escH(p)}">${escH(p)}</option>`).join('');
}

export function editTrade(id) {
    const t = state.trades.find(x => x.id == id);
    if (!t) return toast("Trade not found", true);
    
    // Switch to trades page first
    if (window.App && window.App.switchPage) window.App.switchPage('trades');

    document.getElementById('tr-type').value = t.type;
    document.getElementById('tr-mode').value = t.mode;
    document.getElementById('tr-date').value = t.date;
    
    // Ensure product list is ready before setting value
    populateTradeProducts();
    document.getElementById('tr-product').value = t.product;
    
    document.getElementById('tr-party').value = t.party;
    document.getElementById('tr-vol').value = t.vol;
    
    // Price handle (Imports vs Local)
    const priceLocal = document.getElementById('tr-price-local');
    const priceImp = document.getElementById('tr-imp-rate');
    if (priceLocal) priceLocal.value = t.price || 0;
    if (priceImp) priceImp.value = t.price || 0;
    
    // Import Specific Fields
    const bl = document.getElementById('tr-bl-no');
    if (bl) bl.value = t.bl_no || '';
    
    const vessel = document.getElementById('tr-vessel');
    if (vessel) vessel.value = t.vessel || '';
    
    const pLoad = document.getElementById('tr-port-load');
    if (pLoad) pLoad.value = t.port_load || '';
    
    const pDis = document.getElementById('tr-port-dis');
    if (pDis) pDis.value = t.port_dis || '';
    
    const agent = document.getElementById('tr-agent');
    if (agent) agent.value = t.agent || '';
    
    const weight = document.getElementById('tr-net-weight');
    if (weight) weight.value = t.net_weight || '';
    
    const hsn = document.getElementById('tr-hs-code');
    if (hsn) hsn.value = t.hs_code || '';
    
    const cont = document.getElementById('tr-containers');
    if (cont) cont.value = t.containers || '';
    
    const hsCb = document.getElementById('tr-is-hs');
    if (hsCb) hsCb.checked = !!t.is_hs;

    toggleTradeModeField();
    toggleTradeDetailFields();
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
    toast("Full Trade Details Loaded");
}

export function addPaymentRow() {
    const tbody = document.getElementById('tr-payments-body');
    if (!tbody) return;
    const row = document.createElement('tr');
    row.innerHTML = `
        <td style="padding:8px;"><input type="date" value="${today()}"></td>
        <td style="padding:8px;"><input type="number" placeholder="Amount"></td>
        <td style="padding:8px;"><input type="text" placeholder="Remarks"></td>
        <td style="padding:8px;"><button class="btn btn-sm" onclick="this.closest('tr').remove()">X</button></td>
    `;
    tbody.appendChild(row);
}

export async function handleShipDocUpload(input) {
    const files = Array.from(input.files);
    if (!files.length) return;
    
    toast("Uploading & Scanning...");
    
    for (const file of files) {
        try {
            // 1. (Optional) Run OCR if it's an image/pdf
            let extractedText = "";
            if (file.type.includes('image') || file.type.includes('pdf')) {
                // For now, we'll assume the user wants to run AI on it
                extractedText = "Attempting OCR on " + file.name;
            }
            
            // 2. Add to the list (Visual only for now)
            const list = document.getElementById('tr-ship-docs-list');
            if (list) {
                const item = document.createElement('div');
                item.className = 'doc-badge';
                item.innerHTML = `📄 ${file.name} <button onclick="this.parentElement.remove()">&times;</button>`;
                list.appendChild(item);
            }
            
            toast("File Attached");
        } catch (e) {
            console.error(e);
            toast("Upload Failed", true);
        }
    }
}
