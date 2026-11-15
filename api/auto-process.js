export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { audioBase64 } = req.body;
    if (!audioBase64) throw new Error('Audio data missing');

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('Vercel တွင် GEMINI_API_KEY ထည့်ပေးရန် လိုအပ်ပါသည်');

    const promptText = `You are a professional Burmese movie recap narrator and viral thumbnail creator.
Listen to the provided movie audio, understand the entire plot, and create a time-synced Burmese storytelling narration (မြန်မာစကားပြောဟန်).
Strict Rules:
- Use ONLY Myanmar script for Burmese text (NO English words or phonetics).
- Break the narration into time-synced segments matching the video's pacing ("startSec" and "endSec" in seconds). Keep each Burmese segment concise so the voiceover finishes cleanly before the next segment starts.
- Return STRICT JSON format with exact keys:
  1. "segments": Array of objects [{"startSec": 0, "endSec": 5, "burmeseText": "..."}, ...]
  2. "title": Catchy Burmese title (max 30 chars, NO emojis/hashtags).
  3. "caption": One engaging curiosity-driven Burmese sentence ending with 1 emoji.
  4. "hashtags": Array of 5 Burmese story hashtags starting with # (no #fyp).
  5. "thumbnailPrompt": Dramatic cinematic movie poster prompt in English (no text in image, emotional, 8k lighting).`;

    // Updated to gemini-3.8-flash
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: promptText },
                {
                  inlineData: {
                    mimeType: 'audio/mp3',
                    data: audioBase64,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: 'application/json',
          },
        }),
      }
    );

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error?.message || 'Gemini Audio Analysis Failed');
    }

    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    const cleanJson = rawText.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleanJson);

    const encodedPrompt = encodeURIComponent(
      (parsed.thumbnailPrompt || 'dramatic cinematic movie poster') +
        ', cinematic movie scene, dramatic lighting, ultra detailed, no text'
    );
    const thumbnailUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1280&height=720&nologo=true&seed=${Math.floor(Math.random() * 10000)}`;

    res.status(200).json({
      ...parsed,
      thumbnailUrl,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
