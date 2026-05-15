/**
 * Inventory & Yard Management UI
 */
import { state, saveState } from '../core/state.js';
import { fmtN, escH, toKG, getDensity } from '../utils/format.js';
import { toast, getEl } from '../utils/dom.js';

export function renderYardDashboard() {
    const grid = getEl('yard-dashboard-grid') || getEl('inventory-yard-grid');
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
                        <div style="font-size:12px; font-weight:bold; color:var(--teal);">${fmtN(toKG(currentL, 0.850).toFixed(1))} KG</div>
                    </div>
                </div>
                <div style="font-size:10px; margin-top:5px; color:var(--muted); display:flex; justify-content:space-between;">
                    <span>${escH(mainProd)}</span>
                    <span>${escH(tank.location)}</span>
                </div>
            </div>
        `;
    }).join('');
}

export function renderInventoryTable() {
    const table = getEl('invTable');
    if (!table) return;
    
    const query = (getEl('invSearch')?.value || '').toLowerCase();
    table.innerHTML = state.inventory
        .filter(i => i.product.toLowerCase().includes(query))
        .map(i => {
            const lvPct = Math.min(100, (i.vol / i.threshold) * 10);
            return `<tr>
                <td><b>${escH(i.product)}</b></td>
                <td>${escH(i.grade)}</td>
                <td class="mono">${i.density}</td>
                <td>${escH(i.tank)}</td>
                <td class="mono">${fmtN(i.vol)}</td>
                <td class="mono">${fmtN(toKG(i.vol, i.density).toFixed(1))}</td>
                <td>
                    <div class="progress" style="width:60px">
                        <div class="progress-fill ${i.vol > i.threshold ? 'green' : 'red'}" style="width:${lvPct}%"></div>
                    </div>
                </td>
                <td><button class="btn btn-danger btn-sm" onclick="App.deleteItem('inventory','${i.id}')">&#x2715;</button></td>
            </tr>`;
        }).join('');
}
