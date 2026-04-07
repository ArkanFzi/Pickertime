import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { GoogleGenerativeAI } from "npm:@google/generative-ai@0.24.0"


const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { action, payload } = await req.json()
    const apiKey = Deno.env.get('GEMINI_API_KEY')
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not set')
    }

    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })

    let result;

    switch (action) {
      case 'getNextBestAction': {
        const { role, focusGoal, energyPref, currentTasks } = payload
        const prompt = `
          You are the AI engine for "Pickertime", a high-performance productivity app.
          Based on the following user context, suggest the SINGLE most important "Next Best Action" (Task) for the user to work on right now.

          USER CONTEXT:
          - Role: ${role}
          - Main Goal: ${focusGoal}
          - Energy Preference: ${energyPref}
          - Hour of Day: ${new Date().getHours()}:00
          - Today's Tasks: ${currentTasks.map((t: any) => t.title).join(', ') || 'No tasks created yet'}

          OUTPUT FORMAT (JSON ONLY):
          {
            "task": "Specific task name",
            "desc": "One-line rationale for why this is the best move right now based on energy/goal.",
            "duration": "e.g. 45 mins",
            "category": "e.g. Work, Study, Health"
          }
        `
        const genResult = await model.generateContent(prompt)
        const text = genResult.response.text().trim()
        const jsonStr = text.startsWith('```') 
          ? text.replace(/^```json/, '').replace(/```$/, '').trim() 
          : text
        result = JSON.parse(jsonStr)
        break
      }

      case 'getAIInsight': {
        const { role, focusGoal } = payload
        const prompt = `
          As a productivity coach for "Pickertime", provide a one-line sharp, actionable insight for a ${role} whose goal is "${focusGoal}".
          Focus on their weekly completion rate and potential scheduling optimizations.
          Keep it under 140 characters.
        `
        const genResult = await model.generateContent(prompt)
        result = genResult.response.text().trim()
        break
      }

      case 'getSmartAlarmPrep': {
        const { taskTitle, role } = payload
        const prompt = `
          As a productivity assistant for "Pickertime", suggest 3 quick, actionable preparation steps for a ${role} who is about to start the task: "${taskTitle}".
          
          For each step, provide:
          1. A relevant Ionicon icon name (e.g., 'cafe-outline', 'laptop-outline', 'book-outline', 'notifications-off-outline').
          2. A short instruction (max 35 characters).

          OUTPUT FORMAT (JSON ARRAY ONLY):
          [
            {"icon": "icon-name", "text": "Step description"},
            {"icon": "icon-name", "text": "Step description"},
            {"icon": "icon-name", "text": "Step description"}
          ]
        `
        const genResult = await model.generateContent(prompt)
        const text = genResult.response.text().trim()
        const jsonStr = text.startsWith('```') 
          ? text.replace(/^```json/, '').replace(/```$/, '').trim() 
          : text
        result = JSON.parse(jsonStr)
        break
      }

      default:
        throw new Error('Invalid action')
    }

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
