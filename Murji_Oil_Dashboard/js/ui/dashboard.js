/**
 * Dashboard & KPI Management UI
 */
import { state } from '../core/state.js';
import { fmt, fmtN } from '../utils/format.js';
import { getEl } from '../utils/dom.js';

export function renderDashboardKpis() {
    if (!state) return;
    
    // Calculate KPIs
    const trades = state.trades || [];
    const sales = trades.filter(t => t.type === 'Sell');
    const buys = trades.filter(t => t.type === 'Buy');
    
    const totalSales = sales.reduce((sum, t) => sum + (t.vol * t.price), 0);
    const totalBuys = buys.reduce((sum, t) => sum + (t.vol * t.price), 0);
    
    // Update DOM
    const kpiSales = getEl('kpi-total-sales');
    const kpiBuys = getEl('kpi-total-buys');
    
    if (kpiSales) kpiSales.textContent = fmt(totalSales);
    if (kpiBuys) kpiBuys.textContent = fmt(totalBuys);
}

export function renderTicker() {
    const prices = {'Crude Oil': 6250, 'Diesel': 92.5, 'Petrol': 104.2, 'Kerosene': 78.3, 'LPG': 58.1};
    const changes = {'Crude Oil': '+1.2%', 'Diesel': '-0.3%', 'Petrol': '+0.5%', 'Kerosene': '-0.1%', 'LPG': '+0.8%'};
    const el = getEl('tickerEl');
    if (!el) return;
    
    el.innerHTML = Object.keys(prices).map(p => {
        const ch = changes[p];
        const cls = ch.indexOf('+') >= 0 ? 'up' : 'down';
        return `
            <div class="ticker-item">
                <div class="ticker-name">${p}</div>
                <div class="ticker-price">${p === 'Crude Oil' ? '$' + fmtN(prices[p]) : fmt(prices[p])}</div>
                <div class="ticker-chg ${cls}">${ch}</div>
            </div>
        `;
    }).join('');
}
