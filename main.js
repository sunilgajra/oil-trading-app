/**
 * main.js - Flat Structure Version
 */
import { state, config, supabaseClient, validateState, saveState, DEF_S, today, toast } from './app_core.js';
import { renderTradesTable, renderInventoryTable, renderYardDashboard } from './app_ui.js';
import { refineWithCloudAI } from './app_services.js';

window.App = {
    state, config,
    saveState: () => saveState(true),
    switchPage: (name) => {
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.getElementById('page-' + name).classList.add('active');
        if (name === 'dashboard') renderYardDashboard();
        if (name === 'trades') renderTradesTable();
    },
    openLoginModal: () => document.getElementById('loginModal').classList.add('show'),
    closeLoginModal: () => document.getElementById('loginModal').classList.remove('show'),
    handleLogout: async () => { await supabaseClient.auth.signOut(); location.reload(); }
};

// Global bridge
Object.keys(window.App).forEach(key => window[key] = window.App[key]);

async function init() {
    supabaseClient.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN') loadState();
        else if (event === 'SIGNED_OUT') location.reload();
    });
    
    // Initial Render
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
