/**
 * Pickertime Gemini AI Engine
 * 
 * This module uses the secure PocketBase proxy endpoint
 * to ensure API keys are never exposed to the client app.
 */
import { pb } from '@/lib/pocketbase';

export type GeminiSuggestion = {
  task: string;
  desc: string;
  duration: string;
  category: string;
};

async function callGemini(prompt: string) {
  try {
    // Call the secure custom proxy endpoint hosted on PocketBase
    const response = await pb.send('/api/ai/gemini', {
      method: 'POST',
      body: { prompt },
    });
    
    return response.candidates?.[0]?.content?.parts?.[0]?.text || '';
  } catch (error) {
    console.warn("AI Proxy Error:", error);
    throw new Error("Failed to fetch AI suggestion from backend proxy.");
  }
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
