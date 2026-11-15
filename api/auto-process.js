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

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('Vercel တွင် OPENAI_API_KEY ထည့်ပေးရန် လိုအပ်ပါသည်');

    // ၁။ OpenAI Whisper ဖြင့် Audio မှ စာသားနှင့် အချိန်ကိုက် Timestamp ထုတ်ယူခြင်း
    const audioBuffer = Buffer.from(audioBase64, 'base64');
    const formData = new FormData();
    const audioBlob = new Blob([audioBuffer], { type: 'audio/mp3' });
    formData.append('file', audioBlob, 'audio.mp3');
    formData.append('model', 'whisper-1');
    formData.append('response_format', 'verbose_json');

    const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    });

    const whisperData = await whisperRes.json();
    if (!whisperRes.ok) {
      throw new Error(whisperData.error?.message || 'Whisper Audio Transcription Failed');
    }

    // Timestamp ပါသော စာကြောင်းများ စုစည်းခြင်း
    const timedLines = (whisperData.segments || [])
      .map((s) => `[${s.start.toFixed(1)}s - ${s.end.toFixed(1)}s]: ${s.text}`)
      .join('\n');

    // ၂။ GPT-4o-mini ဖြင့် မြန်မာပုံပြင်ပြောဟန် ဘာသာပြန်ခြင်း
    const gptRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You are a professional Burmese movie recap narrator.
Analyze the timestamped transcript and rewrite it into a cohesive, engaging spoken Burmese storytelling narration (မြန်မာစကားပြောဟန်).
Strict Rules:
- Use ONLY Myanmar script for Burmese text (NO English words or phonetics).
- Keep character names consistent throughout the story.
- Group the narration into 4 to 8 natural time-synced segments matching the video pacing ("startSec" and "endSec" in seconds). Keep each Burmese segment concise so the voiceover finishes cleanly before the next segment starts.
- Return STRICT JSON format with exact keys:
  1. "segments": Array of objects [{"startSec": 0, "endSec": 5, "burmeseText": "..."}, ...]
  2. "title": Catchy Burmese title (max 30 chars, NO emojis/hashtags).
  3. "caption": One engaging curiosity-driven Burmese sentence ending with 1 emoji.
  4. "hashtags": Array of 5 Burmese story hashtags starting with # (no #fyp).`,
          },
          {
            role: 'user',
            content: `Timestamped Transcript:\n${timedLines || whisperData.text}`,
          },
        ],
      }),
    });

    const gptData = await gptRes.json();
    if (!gptRes.ok) {
      throw new Error(gptData.error?.message || 'GPT Translation Failed');
    }

    const content = gptData.choices?.[0]?.message?.content || '{}';
    const parsed = JSON.parse(content);

    res.status(200).json(parsed);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
