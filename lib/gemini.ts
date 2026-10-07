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

export type PrepStep = {
  icon: string;
  text: string;
};

export type ScheduleItem = {
  title: string;
  desc: string;
  duration: number;
  category: string;
};

// Nilai select `Tasks.category` di snapshot skema. Output AutoPlan di luar daftar ini
// dipaksa ke 'Other' — kalau tidak, backend menolaknya dengan 400 validation_invalid_value.
const TASK_CATEGORIES = ['Work', 'Study', 'Health', 'Personal', 'Other'];

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

// Semua fungsi di bawah mengembalikan null saat AI tidak bisa dipakai. Teks statis yang dulu
// dikembalikan di sini tampil identik dengan hasil AI asli, jadi kegagalan backend justru
// terbaca sebagai saran yang meyakinkan (F-28).
export async function getNextBestAction(
  role: string,
  focusGoal: string,
  energyPref: string,
  currentTasks: any[]
): Promise<GeminiSuggestion | null> {
  try {
    const prompt = `You are an expert productivity coach. Based on:
    Role: ${role}
    Goal: ${focusGoal}
    Energy Window: ${energyPref}
    Current Tasks: ${currentTasks.map(t => t.title).join(', ')}
    
    Suggest the next best focus action in JSON format:
    { "task": "Title", "desc": "Context-aware explanation", "duration": "X mins", "category": "Work/Study/..." }`;

    const result = await callGemini(prompt);
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    if (typeof parsed?.task !== 'string' || typeof parsed?.desc !== 'string') return null;
    return {
      task: parsed.task,
      desc: parsed.desc,
      duration: typeof parsed.duration === 'string' ? parsed.duration : '',
      category: typeof parsed.category === 'string' ? parsed.category : ''
    };
  } catch (error) {
    console.warn('getNextBestAction: saran AI tidak tersedia', error);
    return null;
  }
}

export async function getAIInsight(
  role: string,
  focusGoal: string,
  weeklyData: any
): Promise<string | null> {
  try {
    const trendStr = weeklyData.trend ? `Recent focus minutes trend: ${weeklyData.trend.join(', ')}` : '';
    const prompt = `You are a productivity coach for a ${role} whose goal is ${focusGoal}. ${trendStr}. 
    Provide one very short, insightful 1-sentence advice or observation based on this trend. No quotes, no intro.`;
    const insight = (await callGemini(prompt)).trim();
    return insight || null;
  } catch (error) {
    console.warn('getAIInsight: insight AI tidak tersedia', error);
    return null;
  }
}

export async function getSmartAlarmPrep(
  taskTitle: string,
  role: string
): Promise<PrepStep[] | null> {
  try {
    const prompt = `Suggest 3 preparation steps for a ${role} starting task: "${taskTitle}". 
    Return ONLY a JSON array of objects: [{"icon": "ionicons-icon-name", "text": "Short instruction"}]`;

    const result = await callGemini(prompt);
    const jsonMatch = result.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) return null;
    const steps = parsed
      .filter((s) => s && typeof s.text === 'string')
      .map((s) => ({ icon: typeof s.icon === 'string' ? s.icon : 'ellipse-outline', text: s.text }));
    return steps.length > 0 ? steps : null;
  } catch (error) {
    console.warn('getSmartAlarmPrep: langkah persiapan AI tidak tersedia', error);
    return null;
  }
}

export async function generateDailySchedule(
  role: string,
  focusGoal: string,
  energyPref: string
): Promise<ScheduleItem[] | null> {
  try {
    const prompt = `You are a productivity AI. Generate a realistic daily schedule with exactly 3 focused tasks for a ${role} whose main goal is "${focusGoal}" and prefers to work in the "${energyPref}".
    Return ONLY a JSON array of objects with this exact format:
    [
      { "title": "Short Task Name", "desc": "Short description", "duration": 60, "category": "Work" }
    ]
    Duration must be an integer in minutes (e.g., 30, 60, 90). Category must be one of: Work, Study, Health, Personal, Other.`;

    const result = await callGemini(prompt);
    const cleanJson = result.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleanJson);
    if (!Array.isArray(parsed)) return null;

    const items = parsed
      .filter((i) => i && typeof i.title === 'string' && Number.isInteger(i.duration) && i.duration > 0)
      .map((i) => ({
        title: i.title,
        desc: typeof i.desc === 'string' ? i.desc : '',
        duration: i.duration,
        category: TASK_CATEGORIES.includes(i.category) ? i.category : 'Other',
      }));
    return items.length > 0 ? items : null;
  } catch (error) {
    console.warn('generateDailySchedule: rencana AI tidak tersedia', error);
    return null;
  }
}
