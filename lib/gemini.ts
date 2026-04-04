import { GoogleGenerativeAI } from '@google/generative-ai';

const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY!;
const genAI = new GoogleGenerativeAI(apiKey);

export type GeminiSuggestion = {
  task: string;
  desc: string;
  duration: string;
  category: string;
};

export async function getNextBestAction(
  role: string,
  focusGoal: string,
  energyPref: string,
  currentTasks: any[]
): Promise<GeminiSuggestion> {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const prompt = `
      You are the AI engine for "Pickertime", a high-performance productivity app.
      Based on the following user context, suggest the SINGLE most important "Next Best Action" (Task) for the user to work on right now.

      USER CONTEXT:
      - Role: ${role}
      - Main Goal: ${focusGoal}
      - Energy Preference: ${energyPref}
      - Hour of Day: ${new Date().getHours()}:00
      - Today's Tasks: ${currentTasks.map(t => t.title).join(', ') || 'No tasks created yet'}

      OUTPUT FORMAT (JSON ONLY):
      {
        "task": "Specific task name",
        "desc": "One-line rationale for why this is the best move right now based on energy/goal.",
        "duration": "e.g. 45 mins",
        "category": "e.g. Work, Study, Health"
      }
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text().trim();
    
    // Extract JSON from potential markdown code blocks
    const jsonStr = text.startsWith('```') 
      ? text.replace(/^```json/, '').replace(/```$/, '').trim() 
      : text;

    return JSON.parse(jsonStr);
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
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const prompt = `
      As a productivity coach for "Pickertime", provide a one-line sharp, actionable insight for a ${role} whose goal is "${focusGoal}".
      Focus on their weekly completion rate and potential scheduling optimizations.
      Keep it under 140 characters.
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text().trim();
  } catch (error) {
    return "Keep protecting your deep work blocks. You're making progress!";
  }
}
