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
    const buySec = document.getElementById('tr-payments-section');
    const sellSec = document.getElementById('tr-buyer-payments-section');
    
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
    
    toggleTradeModeField();
    toggleTradeDetailFields();
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
    toast("Trade Loaded for Editing");
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
