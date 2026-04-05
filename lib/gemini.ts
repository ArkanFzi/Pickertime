import { supabase } from './supabase';

export type GeminiSuggestion = {
  task: string;
  desc: string;
  duration: string;
  category: string;
};

async function invokeGeminiAI(action: string, payload: any) {
  const { data, error } = await supabase.functions.invoke('gemini-ai', {
    body: { action, payload },
  });

  if (error) {
    console.error(`Error invoking Gemini function (${action}):`, error);
    throw error;
  }

  return data;
}

export async function getNextBestAction(
  role: string,
  focusGoal: string,
  energyPref: string,
  currentTasks: any[]
): Promise<GeminiSuggestion> {
  try {
    return await invokeGeminiAI('getNextBestAction', {
      role,
      focusGoal,
      energyPref,
      currentTasks: currentTasks.map(t => ({ title: t.title })) // Minimize payload size
    });
  } catch (error) {
    console.error('Gemini API Error:', error);
    // Fallback if AI fails
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
    return await invokeGeminiAI('getAIInsight', { role, focusGoal });
  } catch (error) {
    return "Keep protecting your deep work blocks. You're making progress!";
  }
}

export async function getSmartAlarmPrep(
  taskTitle: string,
  role: string
): Promise<Array<{ icon: string; text: string }>> {
  try {
    return await invokeGeminiAI('getSmartAlarmPrep', { taskTitle, role });
  } catch (error) {
    return [
      { icon: 'cafe-outline', text: 'Get your beverage ready' },
      { icon: 'notifications-off-outline', text: 'Minimize distractions' },
      { icon: 'play-outline', text: 'Mentally prepare for flow' }
    ];
  }
}
