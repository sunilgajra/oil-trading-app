/**
 * main.js - Flat Structure Version (Final Parity)
 */
import { state, config, supabaseClient, validateState, saveState, runMigrations, today, toast, showImage, addProductMaster, addTank, addSupplier, addBuyer } from './app_core.js';
import { renderTradesTable, renderInventoryTable, renderYardDashboard, toggleTradeDetailFields, renderProductsList, toggleTradeModeField, editTrade, syncWeightToQty, calcTradeTotals, populateTradeParties, handleTradeDocUpload } from './app_ui.js';
import { refineWithCloudAI } from './app_services.js';

window.App = {
    state,
    saveState: () => saveState(true),
    switchPage: (name) => {
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
        const el = document.getElementById('page-' + name);
        if (el) el.classList.add('active');
        
        if (name === 'dashboard') { renderYardDashboard(); renderProductsList(); }
        if (name === 'trades') { renderTradesTable(); populateTradeParties(); }
        if (name === 'inventory') { renderInventoryTable(); renderYardDashboard(); }
        if (name === 'settings') { renderProductsList(); }
    },
    
    // Auth
    handleLogin: async () => {
        const email = document.getElementById('login-email').value;
        const pass = document.getElementById('login-password').value;
        const { error } = await supabaseClient.auth.signInWithPassword({ email, password: pass });
        if (error) toast(error.message, true);
        else { toast("Logged in!"); location.reload(); }
    },
    handleLogout: async () => { await supabaseClient.auth.signOut(); location.reload(); },
    
    // Logic
    syncWeightToQty,
    calcTradeTotals,
    addProductMaster,
    addTank,
    addSupplier,
    addBuyer,
    editTrade,
    toggleTradeModeField,
    toggleTradeDetailFields,
    handleTradeDocUpload,
    
    // UI
    toast, showImage,
    renderTradesTable, renderInventoryTable, renderYardDashboard, renderProductsList,
    refineWithCloudAI,
    
    deleteProduct: (pName) => {
        if (!confirm(`Delete ${pName}?`)) return;
        state.products = state.products.filter(p => p.name !== pName);
        saveState(); renderProductsList(); toast("Product Removed");
    }
};

// Global bridge
Object.keys(window.App).forEach(key => window[key] = window.App[key]);

async function init() {
    const { data: auth } = await supabaseClient.auth.getSession();
    if (auth?.session) await loadState();
    else renderAll();
}

async function loadState() {
    const { data: auth } = await supabaseClient.auth.getSession();
    if (auth?.session) {
        const { data } = await supabaseClient.from('murji_state').select('state_data').eq('user_id', auth.session.user.id).maybeSingle();
        if (data?.state_data && validateState(data.state_data)) {
            Object.assign(state, data.state_data);
        }
    }
    runMigrations();
    renderAll();
}

function renderAll() {
    renderYardDashboard();
    renderInventoryTable();
    renderTradesTable();
    renderProductsList();
}

document.addEventListener('DOMContentLoaded', init);
