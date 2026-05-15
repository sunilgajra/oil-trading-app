/**
 * app_services.js - External Services (AI, OCR)
 */
import { state, toast } from './app_core.js';

export async function refineWithCloudAI(docOrText) {
    if (!state.apiKey) return toast("Gemini API Key missing in Settings", true);
    
    const btn = document.getElementById('btn-scan-ai');
    const oldHtml = btn ? btn.innerHTML : '';
    if (btn) btn.innerHTML = 'Scanning...';

    try {
        const model = state.apiModel || 'gemini-1.5-flash';
        const payload = { 
            contents: [{ 
                parts: [{ 
                    text: `DOMAIN: Oil Shipping. Extract Bill of Lading data. 
                           Rules: Fix OCR errors. Format weights as 0.00. 
                           Return ONLY JSON: { "bl_no": "", "vessel": "", "port_load": "", "port_dis": "", "net_weight": "" }` 
                }, { 
                    text: `OCR Text: ${docOrText}` 
                }] 
            }] 
        };

        const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${state.apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error("AI API Error: " + response.status);

        const data = await response.json();
        let rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
        
        const ai = JSON.parse(rawText);
        if (ai.bl_no) document.getElementById('tr-bl-no').value = ai.bl_no;
        if (ai.vessel) document.getElementById('tr-vessel').value = ai.vessel;
        if (ai.net_weight) {
            document.getElementById('tr-net-weight').value = ai.net_weight;
            if (window.App) window.App.syncWeightToQty();
        }
        
        toast("Scan Complete!");
    } catch (e) {
        console.error("AI Error:", e);
        toast("Scan Failed: " + e.message, true);
    } finally {
        if (btn) btn.innerHTML = oldHtml;
    }
}
