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
      headers: {
        Authorization: pb.authStore.token,
      }
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
    const trendStr = weeklyData.trend ? `Recent focus minutes trend: ${weeklyData.trend.join(', ')}` : '';
    const prompt = `You are a productivity coach for a ${role} whose goal is ${focusGoal}. ${trendStr}. 
    Provide one very short, insightful 1-sentence advice or observation based on this trend. No quotes, no intro.`;
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
    const roleFallbacks: Record<string, Array<{ icon: string; text: string }>> = {
      Student: [
        { icon: 'laptop-outline', text: 'Open textbook & notes app' },
        { icon: 'cafe-outline', text: 'Get water or coffee' },
        { icon: 'phone-portrait-outline', text: 'Put phone face-down' },
      ],
      Professional: [
        { icon: 'document-text-outline', text: 'Open relevant docs & tools' },
        { icon: 'headset-outline', text: 'Put on noise-cancelling headphones' },
        { icon: 'notifications-off-outline', text: 'Set Slack to DND' },
      ],
      Creator: [
        { icon: 'color-palette-outline', text: 'Open creative tools' },
        { icon: 'musical-note-outline', text: 'Start ambient playlist' },
        { icon: 'cafe-outline', text: 'Get your beverage' },
      ],
    };
    return roleFallbacks[role] || [
      { icon: 'cafe-outline', text: 'Get your beverage ready' },
      { icon: 'notifications-off-outline', text: 'Minimize distractions' },
      { icon: 'play-outline', text: 'Mentally prepare for flow' }
    ];
  }
}

export async function generateDailySchedule(
  role: string,
  focusGoal: string,
  energyPref: string
): Promise<Array<{ title: string; desc: string; duration: number; category: string }>> {
  try {
    const prompt = `You are a productivity AI. Generate a realistic daily schedule with exactly 3 focused tasks for a ${role} whose main goal is "${focusGoal}" and prefers to work in the "${energyPref}".
    Return ONLY a JSON array of objects with this exact format:
    [
      { "title": "Short Task Name", "desc": "Short description", "duration": 60, "category": "Work" }
    ]
    Duration must be an integer in minutes (e.g., 30, 60, 90). Category must be one of: Work, Study, Health, Personal, Creative.`;

    const result = await callGemini(prompt);
    const cleanJson = result.replace(/```json|```/g, '').trim();
    return JSON.parse(cleanJson);
  } catch (error) {
    console.error('Gemini API Error (generateDailySchedule):', error);
    return [
      { title: 'Morning Review', desc: 'Plan the day and set intentions.', duration: 30, category: 'Work' },
      { title: 'Deep Work Session', desc: 'Focus on your most important project.', duration: 90, category: 'Work' },
      { title: 'Skill Development', desc: 'Read or practice something new.', duration: 45, category: 'Study' },
    ];
  }
}
