/**
 * Trade Management UI - Full Module
 */
import { state, config, saveState } from '../core/state.js';
import { supabaseClient } from '../core/auth.js';
import { fmt, fmtN, today, escH, toKG, getDensity } from '../utils/format.js';
import { toast, getEl, showImage } from '../utils/dom.js';
import { uploadFileToSupabase } from '../core/storage.js';

export let currentTradeDocs = [];
export let currentShipDocs = [];
export let editingTradeId = null;
let activeShipDocItem = null;

// --- INITIALIZATION ---
export function initTradeForm() {
    const trDate = getEl('tr-date');
    if (trDate) trDate.value = today();
    populateTradeParties();
}

// --- RENDERING ---
export function renderTradesTable() {
    const table = getEl('tradesTable');
    if (!table) return;
    
    table.innerHTML = state.trades.slice().reverse().map(t => {
        const modeLabel = t.type === 'Buy' ? (t.mode === 'import' ? 'Import' : 'Local') : (t.mode === 'hs_sale' ? 'HS Sale' : 'Local');
        const displayQty = t.raw_qty !== undefined ? t.raw_qty : t.vol;
        const unitSuffix = t.unit ? ' ' + t.unit : ' L';
        const docBadge = (t.docs && t.docs.length > 0) ? ' <span title="Documents attached" style="color:var(--gold2)">&#x1F4CE;</span>' : '';

        return `<tr>
            <td class="mono">${t.date}</td>
            <td><span class="badge ${t.type === 'Buy' ? 'badge-blue' : 'badge-green'}">${t.type}</span> <small>(${modeLabel})</small>${docBadge}</td>
            <td>${escH(t.product)}</td>
            <td>${escH(t.party)}</td>
            <td class="mono">${fmtN(displayQty)}${unitSuffix}</td>
            <td class="mono">${fmt(t.price)}</td>
            <td class="mono">${fmt(displayQty * t.price)}</td>
            <td>
                <div style="display:flex;gap:4px">
                    <button class="btn btn-primary btn-sm" onclick="App.editTrade('${t.id}')">&#x270F;</button>
                    <button class="btn btn-danger btn-sm" onclick="App.deleteItem('trades','${t.id}')">&#x2715;</button>
                </div>
            </td>
        </tr>`;
    }).join('');
}

// --- PARTY MANAGEMENT ---
export function populateTradeParties() {
    const type = getEl('tr-type').value;
    const iWrap = getEl('tr-party-input-wrap');
    const sWrap = getEl('tr-party-select-wrap');
    const sel = getEl('tr-party-select');
    if (!sel) return;
    
    if (type === 'Buy') {
        if (iWrap) iWrap.style.display = 'none';
        if (sWrap) sWrap.style.display = 'block';
        sel.innerHTML = '<option value="">-- Select Supplier --</option>' + 
            state.suppliers.map(s => `<option value="${escH(s.name)}">${escH(s.name)}</option>`).join('');
    } else if (type === 'Sell') {
        if (iWrap) iWrap.style.display = 'none';
        if (sWrap) sWrap.style.display = 'block';
        sel.innerHTML = '<option value="">-- Select Buyer --</option>' + 
            state.buyers.map(b => `<option value="${escH(b.name)}">${escH(b.name)}</option>`).join('');
    } else {
        if (iWrap) iWrap.style.display = 'block';
        if (sWrap) sWrap.style.display = 'none';
    }
}

// --- DOCUMENT MANAGEMENT ---
export async function uploadTradeDoc(input) {
    const files = input.files;
    if (!files || files.length === 0) return;
    
    toast("Uploading Trade Docs...");
    for (let f of files) {
        try {
            const url = await uploadFileToSupabase(supabaseClient, f, 'trades');
            currentTradeDocs.push({ name: f.name, url: url, date: today() });
        } catch (e) {
            toast("Failed to upload " + f.name, true);
        }
    }
    renderTradeDocs();
}

export function renderTradeDocs() {
    const list = getEl('tr-docs-list');
    if (!list) return;
    list.innerHTML = currentTradeDocs.map((doc, idx) => `
        <div class="doc-item">
            <span>${escH(doc.name)} <small>${doc.date}</small></span>
            <div style="display:flex;gap:5px">
                <button class="btn btn-sm btn-ghost" onclick="App.openDocPreview('${doc.url}', '${escH(doc.name)}')">&#x1F441;</button>
                <button class="btn btn-sm btn-ghost" onclick="App.removeTradeDoc(${idx})" style="color:var(--red)">&#x2715;</button>
            </div>
        </div>
    `).join('');
}

export function removeTradeDoc(idx) {
    currentTradeDocs.splice(idx, 1);
    renderTradeDocs();
}

// --- EXPENSE MANAGEMENT ---
export function addExpenseRow(data) {
    const tbody = getEl('tr-expenses-body');
    if (!tbody) return;
    
    const rowId = 'exp_' + Date.now() + Math.random().toString(36).substr(2, 5);
    const row = document.createElement('tr');
    row.id = rowId;
    row.className = 'expense-row';
    
    const mode = getEl('tr-mode').value;
    const types = mode === 'local' 
        ? ['Transportation', 'Truck Hire', 'Loading Charges', 'Unloading Charges', 'Commission', 'Other']
        : ['Line Charges', 'CFS Charges', 'LOLO Charges', 'Customs Duty', 'THC Fees', 'Agency Fees', 'Transportation', 'Truck Hire', 'Insurance', 'Survey', 'Other'];
    
    const defaultType = data?.type || (mode === 'local' ? 'Truck Hire' : 'Line Charges');
    const isOther = !types.includes(defaultType) && defaultType !== 'Other';
    const finalType = isOther ? 'Other' : defaultType;
    
    row.innerHTML = `
        <td style="padding:8px;">
            <select onchange="App.handleExpenseTypeChange('${rowId}', this.value)" style="width:100%;">
                ${types.map(t => `<option ${finalType === t ? 'selected' : ''}>${t}</option>`).join('')}
            </select>
            <input type="text" class="exp-custom-type" value="${isOther ? defaultType : ''}" 
                   placeholder="Name..." style="display:${isOther ? 'block' : 'none'}; margin-top:5px; border-bottom:1px solid var(--border) !important;">
        </td>
        <td style="padding:8px;"><input type="number" value="${data?.amount || 0}" placeholder="0.00" oninput="App.updateTotalExpenses()"></td>
        <td style="padding:8px;">
            <select onchange="App.updateTotalExpenses()" style="width:auto;">
                <option ${data?.status === 'Paid' ? 'selected' : ''}>Paid</option>
                <option ${data?.status === 'Pending' ? 'selected' : ''}>Pending</option>
            </select>
        </td>
        <td style="padding:8px;">
            <div style="display:flex; gap:5px; align-items:center;">
                <input type="text" value="${data?.ref || ''}" placeholder="Ref No" style="flex:1" oninput="App.updateTotalExpenses()">
                <button class="btn btn-sm btn-ghost ${data?.doc ? 'btn-teal' : ''}" onclick="App.uploadExpenseDoc('${rowId}')" id="btn-upload-${rowId}">&#x1F4CE;</button>
            </div>
            <input type="file" id="file-${rowId}" style="display:none" onchange="App.handleExpenseFileUpload('${rowId}', this)">
        </td>
        <td style="padding:8px; text-align:center;"><button class="btn btn-sm btn-ghost" onclick="App.removeExpenseRow('${rowId}')" style="color:var(--red)">&#x2715;</button></td>
    `;
    tbody.appendChild(row);
    row.dataset.doc = data?.doc || '';
    updateTotalExpenses();
}

export function updateTotalExpenses() {
    const rows = document.querySelectorAll('#tr-expenses-body tr');
    let total = 0;
    rows.forEach(row => {
        const amt = parseFloat(row.querySelectorAll('input')[1].value) || 0;
        total += amt;
    });
    const el = getEl('tr-total-expenses');
    if (el) el.innerHTML = '&#x20B9; ' + total.toLocaleString('en-IN', {minimumFractionDigits:2});
}

// --- EXPOSE NECESSARY FUNCTIONS GLOBALLY (Temporarily) ---
window.App = window.App || {};
Object.assign(window.App, {
    populateTradeParties,
    uploadTradeDoc,
    removeTradeDoc,
    addExpenseRow,
    updateTotalExpenses,
    handleExpenseTypeChange: (id, val) => {
        const row = getEl(id);
        if (row) row.querySelector('.exp-custom-type').style.display = (val === 'Other') ? 'block' : 'none';
        updateTotalExpenses();
    },
    removeExpenseRow: (id) => {
        const row = getEl(id);
        if (row) row.remove();
        updateTotalExpenses();
    },
    uploadExpenseDoc: (id) => getEl('file-' + id).click(),
    handleExpenseFileUpload: async (id, input) => {
        const file = input.files[0];
        if (!file) return;
        try {
            const url = await uploadFileToSupabase(supabaseClient, file, 'expenses');
            const row = getEl(id);
            row.dataset.doc = url;
            const btn = getEl('btn-upload-' + id);
            btn.classList.add('btn-teal');
            toast('Uploaded');
        } catch (e) { toast(e.message, true); }
    }
});
