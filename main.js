/**
 * main.js - Flat Structure Version (Final Fix)
 */
import { state, config, supabaseClient, validateState, saveState, DEF_S, today, toast, showImage } from './app_core.js';
import { renderTradesTable, renderInventoryTable, renderYardDashboard } from './app_ui.js';
import { refineWithCloudAI } from './app_services.js';

window.App = {
    state, config,
    saveState: () => saveState(true),
    switchPage: (name) => {
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
        const el = document.getElementById('page-' + name);
        if (el) el.classList.add('active');
        if (name === 'dashboard') renderYardDashboard();
        if (name === 'trades') renderTradesTable();
        if (name === 'inventory') renderInventoryTable();
    },
    openLoginModal: () => document.getElementById('loginModal').classList.add('show'),
    closeLoginModal: () => document.getElementById('loginModal').classList.remove('show'),
    
    // Login Logic
    handleLogin: async () => {
        const email = document.getElementById('login-email').value;
        const pass = document.getElementById('login-password').value;
        const { error } = await supabaseClient.auth.signInWithPassword({ email, password: pass });
        if (error) toast(error.message, true);
        else { window.App.closeLoginModal(); toast("Logged in!"); }
    },
    handleSignUp: async () => {
        const email = document.getElementById('login-email').value;
        const pass = document.getElementById('login-password').value;
        const { error } = await supabaseClient.auth.signUp({ email, password: pass });
        if (error) toast(error.message, true);
        else toast("Check your email for confirmation!");
    },
    handleLogout: async () => { await supabaseClient.auth.signOut(); location.reload(); },
    
    // UI Logic
    toast,
    showImage,
    renderTradesTable,
    renderInventoryTable,
    renderYardDashboard,
    refineWithCloudAI
};

// Global bridge for legacy HTML
Object.keys(window.App).forEach(key => window[key] = window.App[key]);

async function init() {
    supabaseClient.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN') loadState();
        else if (event === 'SIGNED_OUT') { /* handle logout */ }
    });
    
    const { data: auth } = await supabaseClient.auth.getSession();
    if (auth?.session) loadState();
    
    // Initial UI render
    renderYardDashboard();
    renderTradesTable();
    renderInventoryTable();
}

async function loadState() {
    const { data: auth } = await supabaseClient.auth.getSession();
    if (auth?.session) {
        const { data } = await supabaseClient.from('murji_state').select('state_data').eq('user_id', auth.session.user.id).maybeSingle();
        if (data?.state_data && validateState(data.state_data)) {
            Object.assign(state, data.state_data);
            renderYardDashboard(); renderTradesTable(); renderInventoryTable();
        }
    }
}

document.addEventListener('DOMContentLoaded', init);
