/**
 * app_services.js - External Services (AI, OCR)
 */
import { config } from './app_core.js';

export async function refineWithCloudAI(docOrText) {
    if (!config.apiKey) return alert("API Key missing");
    const model = config.apiModel || 'gemini-3.1-flash-lite';
    const payload = { contents: [{ parts: [{ text: `Extract JSON from OCR: ${docOrText}` }] }] };
    const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${config.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return JSON.parse(text.replace(/```json/g, '').replace(/```/g, '').trim());
}
