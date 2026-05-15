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
                <div style="font-size:16px; font-weight:bold;">${fmtN(currentL.toFixed(0))} L</div>
                <div style="font-size:12px; color:var(--muted);">${escH(tank.location)}</div>
            </div>`;
    }).join('');
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
