/**
 * Pickertime Gemini AI Engine
 * 
 * This module was refactored from Supabase Edge Functions to direct 
 * Gemini API calls for better autonomy in the PocketBase ecosystem.
 */

const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY || '';
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

export type GeminiSuggestion = {
  task: string;
  desc: string;
  duration: string;
  category: string;
};

async function callGemini(prompt: string) {
  if (!GEMINI_API_KEY) {
    console.warn("Gemini API Key is missing. Fitur AI akan menggunakan fallback.");
    throw new Error("Missing API Key");
  }

  const response = await fetch(GEMINI_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.7,
        topP: 1,
        topK: 1,
        maxOutputTokens: 1000,
      },
    }),
  });

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

export async function getNextBestAction(
  role: string,
  focusGoal: string,
  energyPref: string,
  currentTasks: any[]
): Promise<GeminiSuggestion> {
  try {
    const prompt = `You are an expert productivity coach. Based on:
    Role: ${role}
    Goal: ${focusGoal}
    Energy Window: ${energyPref}
    Current Tasks: ${currentTasks.map(t => t.title).join(', ')}
    
    Suggest the next best focus action in JSON format:
    { "task": "Title", "desc": "Context-aware explanation", "duration": "X mins", "category": "Work/Study/..." }`;

    const result = await callGemini(prompt);
    // Rough cleanup if Gemini wraps it in code blocks
    const cleanJson = result.replace(/```json|```/g, '').trim();
    return JSON.parse(cleanJson);
  } catch (error) {
    console.error('Gemini API Error:', error);
    return {
      task: 'Focus on your Top Priority',
      desc: 'Based on your goal to ' + focusGoal,
      duration: '60 mins',
      category: 'Focus'
    };
  }
}

export async function getAIInsight(
  role: string,
  focusGoal: string,
  weeklyData: any
): Promise<string> {
  try {
    const prompt = `Give a short 1-sentence motivation for a ${role} aiming for ${focusGoal}.`;
    return await callGemini(prompt);
  } catch (error) {
    return "Keep protecting your deep work blocks. You're making progress!";
  }
}

export async function getSmartAlarmPrep(
  taskTitle: string,
  role: string
): Promise<Array<{ icon: string; text: string }>> {
  try {
    const prompt = `Suggest 3 preparation steps for a ${role} starting task: "${taskTitle}". 
    Return ONLY a JSON array of objects: [{"icon": "ionicons-icon-name", "text": "Short instruction"}]`;

    const result = await callGemini(prompt);
    const cleanJson = result.replace(/```json|```/g, '').trim();
    return JSON.parse(cleanJson);
  } catch (error) {
    return [
      { icon: 'cafe-outline', text: 'Get your beverage ready' },
      { icon: 'notifications-off-outline', text: 'Minimize distractions' },
      { icon: 'play-outline', text: 'Mentally prepare for flow' }
    ];
  }
}
