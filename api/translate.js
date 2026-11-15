export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { transcriptText } = req.body;

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
            content: `You are a professional Burmese movie recap narrator and viral thumbnail designer.
Rewrite the provided transcript into natural spoken Burmese storytelling narration (မြန်မာစကားပြောဟန်).
Strict Rules:
- Use ONLY Myanmar script for narration, title, caption, and hashtags (NO English words).
- Keep character names consistent.
- Return ONLY valid JSON with these exact keys:
  1. "narrationScript": Full cohesive Burmese voiceover script.
  2. "title": Catchy Burmese title (max 30 characters, NO emojis or hashtags).
  3. "caption": One curiosity-driven Burmese sentence ending with 1 emoji.
  4. "hashtags": Array of 5 Burmese story hashtags starting with # (exclude #fyp).
  5. "thumbnailPrompt": A dramatic, cinematic movie poster scene description in English for AI image generation (no text in image, high contrast, emotional expression, 8k cinematic lighting).`
          },
          {
            role: 'user',
            content: `Transcript:\n${transcriptText}`
          }
        ],
        response_format: { type: 'json_object' }
      })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || 'OpenRouter API failed');

    const content = data.choices[0].message.content.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(content);

    // Generate Thumbnail URL directly using Pollinations AI (Free, no key needed)
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
