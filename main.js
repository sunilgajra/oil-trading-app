/**
 * main.js - Flat Structure Version (Final Fix)
 */
import { state, config, supabaseClient, validateState, saveState, DEF_S, today, toast, showImage, addProductMaster, addTank } from './app_core.js';
import { renderTradesTable, renderInventoryTable, renderYardDashboard, toggleTradeDetailFields, addPaymentRow, renderProductsList } from './app_ui.js';
import { refineWithCloudAI } from './app_services.js';

window.App = {
    state, config,
    saveState: () => saveState(true),
    switchPage: (name) => {
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
        const el = document.getElementById('page-' + name);
        if (el) el.classList.add('active');
        
        // Render current page data
        if (name === 'dashboard') { renderYardDashboard(); renderProductsList(); }
        if (name === 'trades') { renderTradesTable(); }
        if (name === 'inventory') { renderInventoryTable(); renderYardDashboard(); }
        if (name === 'settings') { renderProductsList(); }
    },
    openLoginModal: () => document.getElementById('loginModal').classList.add('show'),
    closeLoginModal: () => document.getElementById('loginModal').classList.remove('show'),
    
    // Core Functions
    handleLogin: async () => {
        const email = document.getElementById('login-email').value;
        const pass = document.getElementById('login-password').value;
        const { error } = await supabaseClient.auth.signInWithPassword({ email, password: pass });
        if (error) toast(error.message, true);
        else { window.App.closeLoginModal(); toast("Logged in!"); }
    },
    handleLogout: async () => { await supabaseClient.auth.signOut(); location.reload(); },
    
    // Master Data
    addProductMaster,
    addTank,
    deleteProduct: (pName) => {
        if (!confirm(`Delete ${pName}?`)) return;
        state.products = state.products.filter(p => p.name !== pName);
        saveState();
        renderProductsList();
        toast("Product Removed");
    },
    
    // UI Logic
    toggleTradeDetailFields,
    addPaymentRow,
    toast,
    showImage,
    renderTradesTable,
    renderInventoryTable,
    renderYardDashboard,
    renderProductsList,
    refineWithCloudAI
};

// Global bridge for legacy HTML
Object.keys(window.App).forEach(key => window[key] = window.App[key]);

async function init() {
    supabaseClient.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN') loadState();
    });
    
    const { data: auth } = await supabaseClient.auth.getSession();
    if (auth?.session) loadState();
    
    // Initial UI render
    renderYardDashboard();
    renderTradesTable();
    renderInventoryTable();
    renderProductsList();
}

async function loadState() {
    const { data: auth } = await supabaseClient.auth.getSession();
    if (auth?.session) {
        const { data } = await supabaseClient.from('murji_state').select('state_data').eq('user_id', auth.session.user.id).maybeSingle();
        if (data?.state_data && validateState(data.state_data)) {
            Object.assign(state, data.state_data);
            renderAll();
        }
    }
}

function renderAll() {
    renderYardDashboard();
    renderInventoryTable();
    renderTradesTable();
    renderProductsList();
}

document.addEventListener('DOMContentLoaded', init);
