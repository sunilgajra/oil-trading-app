/**
 * app_core.js - State, DB, and Migrations
 */

export const DEF_P = [
    {name:'Crude Oil', density:0.850, hsn:'2709', other:''},
    {name:'Diesel', density:0.832, hsn:'2710', other:'HSD'},
    {name:'Petrol', density:0.740, hsn:'2710', other:'MS'},
    {name:'Kerosene', density:0.810, hsn:'2710', other:'SKO'},
    {name:'LPG', density:0.510, hsn:'2711', other:''}
];

export const DEF_S = {
    products: JSON.parse(JSON.stringify(DEF_P)),
    tanks: [
        {id:'T1', name:'Main Tank 1', capacity: 100000, type: 'Static', location: 'Yard A'},
        {id:'T2', name:'Main Tank 2', capacity: 100000, type: 'Static', location: 'Yard A'},
        {id:'T3', name:'Service Tank', capacity: 20000, type: 'Static', location: 'Yard B'}
    ],
    inventory:[], 
    trades:[],
    orders:[],
    challans:[],
    suppliers:[],
    buyers:[],
    nextInvId:1, nextTradeId:1, nextOrderNum:1, nextSupId:1, nextBuyId:1, nextChNum:1,
    apiKey: '',
    apiModel: 'gemini-1.5-flash'
};

export const config = DEF_S; // This fix solves the SyntaxError
export var state = JSON.parse(JSON.stringify(DEF_S));

const SUPABASE_URL = "https://vrkilanytzftkpfllqjh.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZya2lsYW55dHpmdGtwZmxscWpoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyMzQ5MTUsImV4cCI6MjA5MTgxMDkxNX0.D4BjNIYneCUkbiFnNR8MhsA9-yDYBYNR9Ha2AZemvXk";
export const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

export function runMigrations() {
    if (!state) return;
    if (state.products && state.products.length > 0 && typeof state.products[0] === 'string') {
        state.products = state.products.map(p => ({ name: p, density: 0.850, hsn: '', other: '' }));
    }
    if (!state.buyers) state.buyers = [];
    if (!state.orders) state.orders = [];
    if (!state.suppliers) state.suppliers = [];
    if (!state.tanks) state.tanks = DEF_S.tanks;
    if (!state.inventory) state.inventory = [];
    if (!state.apiKey) state.apiKey = '';
}

export async function saveState(force = false) {
    try {
        localStorage.setItem('murji_oil_v12', JSON.stringify(state));
        // Safety Mirror
        if (state.trades && state.trades.length > 5) {
            localStorage.setItem('murji_oil_backup_mirror', JSON.stringify(state));
        }

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

export function validateState(s) {
    return s && typeof s === 'object' && Array.isArray(s.trades);
}

// Master Data Logic
export function addProductMaster() {
    const nEl = document.getElementById('pm-name');
    const den = parseFloat(document.getElementById('pm-density').value) || 0.850;
    if (!nEl.value) return toast("Name required", true);
    
    state.products.push({ 
        name: nEl.value, 
        density: den, 
        hsn: document.getElementById('pm-hsn').value,
        other: document.getElementById('pm-other').value 
    });
    saveState();
    nEl.value = '';
    if (window.App) window.App.renderProductsList();
    toast("Product Added");
}

export function addSupplier() {
    const name = document.getElementById('sup-name').value;
    if (!name) return toast("Name required", true);
    state.suppliers.push({ id: Date.now(), name, contact: document.getElementById('sup-contact').value, phone: document.getElementById('sup-phone').value });
    saveState();
    toast("Supplier Added");
}

export function addBuyer() {
    const name = document.getElementById('buy-name').value;
    if (!name) return toast("Name required", true);
    state.buyers.push({ id: Date.now(), name, contact: document.getElementById('buy-contact').value, phone: document.getElementById('buy-phone').value });
    saveState();
    toast("Buyer Added");
}

export function addTank(source) {
    const prefix = source === 'yard' ? 'yard-' : 'settings-';
    const name = document.getElementById(prefix + 'new-tank-name').value;
    const cap = parseFloat(document.getElementById(prefix + 'new-tank-cap').value) || 0;
    if (!name || !cap) return toast("Name/Cap required", true);
    
    state.tanks.push({ id: 'T' + Date.now(), name, capacity: cap, location: document.getElementById(prefix + 'new-tank-loc').value });
    saveState();
    toast("Tank Added");
    if (window.App) window.App.renderYardDashboard();
}

// Utils
export const fmt = (n) => '\u20B9' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
export const fmtN = (n) => Number(n).toLocaleString('en-IN');
export const today = () => new Date().toISOString().split('T')[0];
export const escH = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const toKG = (v, d) => v * (d || 0.85);

export function toast(msg, isErr) {
    const el = document.getElementById('toast');
    if (!el) return console.log("Toast:", msg);
    el.textContent = msg;
    el.className = 'toast show' + (isErr ? ' err' : '');
    setTimeout(() => el.classList.remove('show'), 4000);
}

export async function uploadFileToSupabase(file, bucket) {
    const { data: auth } = await supabaseClient.auth.getSession();
    if (!auth?.session) throw new Error("Login required");
    const path = `${auth.session.user.id}/${Date.now()}_${file.name}`;
    const { data, error } = await supabaseClient.storage.from(bucket).upload(path, file);
    if (error) throw error;
    const { data: urlData } = supabaseClient.storage.from(bucket).getPublicUrl(path);
    return urlData.publicUrl;
}

export function showImage(src) {
    const lb = document.getElementById('lightbox');
    const img = document.getElementById('lightboxImg');
    if (lb && img) { img.src = src; lb.classList.add('show'); }
}
