/**
 * app_core.js - Combined Core Logic (State, Auth, Storage, Utils)
 */

// --- UTILS ---
export const fmt = (n) => '\u20B9' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
export const fmtN = (n) => Number(n).toLocaleString('en-IN');
export const fmtKG = (n) => Number(n).toLocaleString('en-IN', { maximumFractionDigits: 1 });
export const today = () => new Date().toISOString().split('T')[0];
export const escH = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const toKG = (v, d) => v * (d || 0.850);

export const toast = (msg, isErr = false) => {
    const el = document.getElementById('toast');
    if (!el) return console.log("Toast:", msg);
    el.textContent = msg;
    el.className = 'toast show' + (isErr ? ' err' : '');
    setTimeout(() => el.classList.remove('show'), 4000);
};

export function showImage(src) {
    const img = document.getElementById('lightboxImg');
    const box = document.getElementById('lightbox');
    if (img && box) { img.src = src; box.classList.add('show'); }
}

// --- STATE ---
export const DEF_S = {
    products: [
        { name: 'Crude Oil', density: 0.850, hsn: '2709', other: '' },
        { name: 'Diesel', density: 0.832, hsn: '2710', other: 'HSD' },
        { name: 'Petrol', density: 0.740, hsn: '2710', other: 'MS' },
        { name: 'Kerosene', density: 0.810, hsn: '2710', other: 'SKO' },
        { name: 'LPG', density: 0.510, hsn: '2711', other: '' }
    ],
    tanks: [
        { id: 'T1', name: 'Main Tank 1', capacity: 100000, type: 'Static', location: 'Yard A' },
        { id: 'T2', name: 'Main Tank 2', capacity: 100000, type: 'Static', location: 'Yard A' },
        { id: 'T3', name: 'Service Tank', capacity: 20000, type: 'Static', location: 'Yard B' }
    ],
    inventory: [],
    trades: [],
    orders: [],
    challans: [],
    suppliers: [],
    buyers: [],
    nextInvId: 1, nextTradeId: 2, nextOrderNum: 1, nextSupId: 1, nextBuyId: 1, nextChNum: 1
};

export let state = JSON.parse(JSON.stringify(DEF_S));
export const config = {
    apiKey: localStorage.getItem('murji_api_key') || '',
    apiModel: localStorage.getItem('murji_api_model') || 'gemini-3.1-flash-lite'
};

export function validateState(s) {
    if (!s || typeof s !== 'object') return false;
    const required = ['products', 'tanks', 'inventory', 'trades', 'orders'];
    return required.every(key => Array.isArray(s[key]));
}

// --- SUPABASE ---
const SUPABASE_URL = "https://vrkilanytzftkpfllqjh.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZya2lsYW55dHpmdGtwZmxscWpoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyMzQ5MTUsImV4cCI6MjA5MTgxMDkxNX0.D4BjNIYneCUkbiFnNR8MhsA9-yDYBYNR9Ha2AZemvXk";
export const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

export async function saveState(force = false) {
    try {
        localStorage.setItem('murji_oil_v12', JSON.stringify(state));
        const { data: auth } = await supabaseClient.auth.getSession();
        if (auth?.session) {
            await supabaseClient.from('murji_state').upsert({
                user_id: auth.session.user.id,
                state_data: state,
                updated_at: new Date()
            }, { onConflict: 'user_id' });
        }
        if (force) toast("Cloud Sync Complete");
    } catch (e) { console.error("Save Error:", e); }
}

export function addProductMaster() {
    const name = document.getElementById('new-prod-name').value;
    const den = parseFloat(document.getElementById('new-prod-den').value) || 0.850;
    if (!name) return toast("Product name required", true);
    state.products.push({ name, density: den, hsn: '', other: '' });
    saveState();
    toast("Product Added");
    location.reload(); 
}

export function addTank() {
    const name = document.getElementById('new-tank-name').value;
    const cap = parseFloat(document.getElementById('new-tank-cap').value) || 0;
    if (!name || cap <= 0) return toast("Invalid Tank Data", true);
    state.tanks.push({ id: 'T' + Date.now(), name, capacity: cap, location: 'Yard' });
    saveState();
    toast("Tank Added");
    location.reload();
}

export async function uploadFileToSupabase(file, path) {
    const { data: auth } = await supabaseClient.auth.getSession();
    if (!auth?.session) throw new Error("Please Login");
    const fileName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
    const fullPath = `${auth.session.user.id}/${path}/${fileName}`;
    const { error } = await supabaseClient.storage.from('murji_docs').upload(fullPath, file);
    if (error) throw error;
    return supabaseClient.storage.from('murji_docs').getPublicUrl(fullPath).data.publicUrl;
}
