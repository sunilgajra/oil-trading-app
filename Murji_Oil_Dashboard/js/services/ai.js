/**
 * Gemini AI Integration Service
 */
import { config } from '../core/state.js';
import { toast } from '../utils/dom.js';

export async function refineWithCloudAI(docOrText) {
    if (!config.apiKey) return toast("Gemini API Key missing in Settings", true);
    
    try {
        const model = config.apiModel || 'gemini-3.1-flash-lite';
        let payload;

        if (typeof docOrText === 'object') {
            // Document payload handling...
            // (I'll move the full complex logic from script.js here)
        } else {
            payload = {
                contents: [{
                    parts: [{ text: `DOMAIN: Oil Shipping. Extract JSON from this OCR: ${docOrText}` }]
                }]
            };
        }

        const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${config.apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error(`Gemini API Error: ${response.status}`);

        const data = await response.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (!text) throw new Error("No response from AI");

        let rawJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
        try {
            return JSON.parse(rawJson);
        } catch (e) {
            const match = rawJson.match(/\{[\s\S]*\}/);
            if (match) return JSON.parse(match[0]);
            throw e;
        }
    } catch (e) {
        console.error("AI Service Error:", e);
        throw e;
    }
}
