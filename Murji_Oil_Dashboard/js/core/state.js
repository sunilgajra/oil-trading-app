/**
 * Core State Management & Migrations
 */

export const DEF_P = [
    { name: 'Crude Oil', density: 0.850, hsn: '2709', other: '' },
    { name: 'Diesel', density: 0.832, hsn: '2710', other: 'HSD' },
    { name: 'Petrol', density: 0.740, hsn: '2710', other: 'MS' },
    { name: 'Kerosene', density: 0.810, hsn: '2710', other: 'SKO' },
    { name: 'LPG', density: 0.510, hsn: '2711', other: '' }
];

export const DEF_S = {
    products: JSON.parse(JSON.stringify(DEF_P)),
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

export function runMigrations(s) {
    if (!s) return;
    // 1. Convert string products to objects
    if (s.products && s.products.length > 0 && typeof s.products[0] === 'string') {
        s.products = s.products.map(p => ({
            name: p,
            density: (s.densities && s.densities[p]) || 0.850,
            hsn: '',
            other: ''
        }));
    }
    // 2. Ensure collections exist
    ['buyers', 'orders', 'challans', 'suppliers'].forEach(key => {
        if (!s[key]) s[key] = [];
    });
}

export async function saveState(supabaseClient, force = false) {
    try {
        localStorage.setItem('murji_oil_v12', JSON.stringify(state));
        if (state.trades && state.trades.length > 5) {
            localStorage.setItem('murji_oil_backup_mirror', JSON.stringify(state));
        }

        const { data: auth } = await supabaseClient.auth.getSession();
        if (auth && auth.session) {
            await supabaseClient
                .from('murji_state')
                .upsert({
                    user_id: auth.session.user.id,
                    state_data: state,
                    updated_at: new Date()
                }, { onConflict: 'user_id' });
            if (force) console.log("Cloud Sync Forced");
        }
    } catch (e) {
        console.error("State Save Error:", e);
    }
}
