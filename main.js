/**
 * Main Entry Point - Murji Oil Dashboard
 */
import { supabaseClient, updateAuthStateUI, handleLogin, handleLogout } from './core/auth.js';
import { state, config, validateState, saveState, DEF_S } from './core/state.js';
import { initializeStorage } from './core/storage.js';
import { updateClock, toast, showImage } from './utils/dom.js';
import { renderTradesTable, populateTradeParties, initTradeForm, renderTradeDocs, removeTradeDoc, addExpenseRow } from './ui/trades.js';
import { renderYardDashboard, renderInventoryTable } from './ui/inventory.js';
import { renderDashboardKpis, renderTicker } from './ui/dashboard.js';
import { refineWithCloudAI } from './services/ai.js';

// Global Namespace
window.App = {
    state,
    config,
    saveState: (force) => saveState(supabaseClient, force),
    
    // Auth
    openLoginModal: () => document.getElementById('loginModal').classList.add('show'),
    closeLoginModal: () => document.getElementById('loginModal').classList.remove('show'),
    handleLogin: async () => {
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        const res = await handleLogin(email, password);
        if (res.error) toast(res.error.message, true);
        else {
            window.App.closeLoginModal();
            toast("Logged in");
        }
    },
    handleLogout: async () => {
        await handleLogout();
        toast("Logged out");
    },
    
    // UI Helpers
    switchPage: (name) => {
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
        document.getElementById('page-' + name).classList.add('active');
        
        if (name === 'dashboard') { renderYardDashboard(); renderDashboardKpis(); }
        if (name === 'trades') { renderTradesTable(); populateTradeParties(); }
        if (name === 'inventory') { renderInventoryTable(); renderYardDashboard(); }
    },
    
    // Business Logic
    addTrade: () => { console.log("Add Trade Triggered"); },
    deleteItem: (type, id) => {
        if (!confirm(`Delete this ${type}?`)) return;
        state[type] = state[type].filter(item => item.id !== id);
        saveState(supabaseClient);
        renderAll();
        toast("Item Deleted");
    },
    addExpenseRow,
    
    // Utilities
    toast,
    showImage,
    updateClock,
    refineWithCloudAI
};

// Bridge to global scope for legacy HTML onclick handlers
Object.keys(window.App).forEach(key => {
    window[key] = window.App[key];
});

async function init() {
    console.log("Initializing Murji Oil ERP (Modularized)...");
    
    // PDF.js Worker setup
    if (window.pdfjsLib) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
    // Auth Listener
    supabaseClient.auth.onAuthStateChange((event, session) => {
        updateAuthStateUI(session);
        if (event === 'SIGNED_IN') {
            loadState();
        } else if (event === 'SIGNED_OUT') {
            window.App.state = JSON.parse(JSON.stringify(DEF_S));
            renderAll();
        }
    });

    updateClock();
    setInterval(updateClock, 30000);
    renderTicker();
    initTradeForm();
    
    const { data: auth } = await supabaseClient.auth.getSession();
    if (auth.session) {
        updateAuthStateUI(auth.session);
        loadState();
    }
}

async function loadState() {
    try {
        const { data: auth } = await supabaseClient.auth.getSession();
        if (auth && auth.session) {
            const { data, error } = await supabaseClient
                .from('murji_state')
                .select('state_data')
                .eq('user_id', auth.session.user.id)
                .maybeSingle();
            
            if (data && data.state_data && validateState(data.state_data)) {
                Object.assign(state, data.state_data);
                renderAll();
            }
        }
    } catch (e) {
        console.error("Load Error:", e);
    }
}

function renderAll() {
    renderYardDashboard();
    renderInventoryTable();
    renderTradesTable();
    renderDashboardKpis();
}

document.addEventListener('DOMContentLoaded', init);
