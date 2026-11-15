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

    // OpenRouter (Gemini 2.5 Flash) ဖြင့် Audio ကို နားထောင်ပြီး အချိန်ကိုက် မြန်မာပုံပြင်ပြော ဘာသာပြန်ခြင်း
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: `You are a professional Burmese movie recap narrator and viral thumbnail creator.
Listen to the provided movie audio, understand the entire plot, and create a time-synced Burmese storytelling narration (မြန်မာစကားပြောဟန်).
Strict Rules:
- Use ONLY Myanmar script for Burmese text (NO English words or phonetics).
- Break the narration into time-synced segments matching the video's pacing ("startSec" and "endSec" in seconds). Keep each Burmese segment concise so the voiceover finishes cleanly before the next segment starts.
- Return STRICT JSON format with exact keys:
  1. "segments": Array of objects [{"startSec": 0, "endSec": 5, "burmeseText": "..."}, ...]
  2. "title": Catchy Burmese title (max 30 chars, NO emojis/hashtags).
  3. "caption": One engaging curiosity-driven Burmese sentence ending with 1 emoji.
  4. "hashtags": Array of 5 Burmese story hashtags starting with # (no #fyp).
  5. "thumbnailPrompt": Dramatic cinematic movie poster prompt in English (no text in image, emotional, 8k lighting).`
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Analyze this movie audio and generate the time-synced Burmese storytelling narration, metadata, and thumbnail prompt in JSON.'
              },
              {
                type: 'input_audio',
                input_audio: {
                  data: audioBase64,
                  format: 'mp3'
                }
              }
            ]
          }
        ],
        response_format: { type: 'json_object' }
      })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || 'AI Audio Analysis Failed');

    const content = data.choices[0].message.content.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(content);

    const encodedPrompt = encodeURIComponent(parsed.thumbnailPrompt + ', cinematic movie scene, dramatic lighting, ultra detailed, no text');
    const thumbnailUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1280&height=720&nologo=true&seed=${Math.floor(Math.random() * 10000)}`;

    res.status(200).json({
      ...parsed,
      thumbnailUrl
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
