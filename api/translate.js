import { GoogleGenerativeAI } from '@google/generative-ai';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { transcriptText } = req.body;
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const prompt = `
      You are a professional Burmese movie recap narrator. Analyze the following transcript and rewrite it into a cohesive, engaging spoken Burmese storytelling narration (မြန်မာစကားပြောဟန်).
      Strict Rules:
      - Use ONLY Myanmar script (no English words or phonetics).
      - Keep character names consistent throughout the story.
      - Return STRICT JSON format with keys:
        1. "narrationScript": Full cohesive Burmese voiceover script.
        2. "title": Catchy Burmese title (max 30 characters, NO emojis or hashtags).
        3. "caption": One engaging curiosity-driven Burmese sentence ending with exactly 1 emoji.
        4. "hashtags": Array of exactly 5 Burmese story-related hashtags starting with # (do NOT use #fyp).

      Transcript: ${transcriptText}
    `;

    const result = await model.generateContent(prompt);
    const jsonText = result.response.text().replace(/```json|```/g, '').trim();
    res.status(200).json(JSON.parse(jsonText));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
