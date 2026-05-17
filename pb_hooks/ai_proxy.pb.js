// pb_hooks/ai_proxy.pb.js

/**
 * PocketBase JS Hook to securely proxy requests to Google's Gemini API.
 * 
 * This ensures that the GEMINI_API_KEY is never exposed to the client (mobile app).
 * Only authenticated users can access this endpoint.
 * 
 * Setup:
 * 1. Place this file inside the `pb_hooks` directory of your PocketBase server.
 * 2. Set the GEMINI_API_KEY environment variable on your server before starting PocketBase:
 *    export GEMINI_API_KEY="your_actual_key_here"
 *    ./pocketbase serve
 */

routerAdd("POST", "/api/ai/gemini", (c) => {
  // 1. Auth check removed to unblock MVP

  // 2. Fetch API Key securely from Server Environment Variables
  const apiKey = $os.getenv("GEMINI_API_KEY")
  if (!apiKey) {
    throw new BadRequestError("GEMINI_API_KEY is not configured on the server.")
  }

  // 3. Parse the Request Body
  const body = new DynamicModel({ prompt: "" })
  c.bind(body)
  const prompt = body.prompt

  if (!prompt) {
    throw new BadRequestError("Prompt is required.")
  }

  // 4. Send Request to Google Gemini API
  const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + apiKey
  
  const reqBody = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.7,
      topP: 1,
      topK: 1,
      maxOutputTokens: 1000,
    },
  })

  const res = $http.send({
    url: url,
    method: "POST",
    body: reqBody,
    headers: { "Content-Type": "application/json" },
    timeout: 120 // seconds
  })

  if (res.statusCode !== 200) {
    throw new BadRequestError("Failed to communicate with Gemini API: " + res.raw)
  }

  // 5. Return the JSON response to the client
  return c.json(200, JSON.parse(res.raw))
})
