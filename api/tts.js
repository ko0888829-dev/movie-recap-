import { EdgeTTS } from 'edge-tts-universal';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { text, voice } = req.body;
    // my-MM-ThihaNeural (ယောက်ျားလေးအသံ) | my-MM-NilarNeural (မိန်းကလေးအသံ)
    const selectedVoice = voice || 'my-MM-ThihaNeural';

    const tts = new EdgeTTS(text, selectedVoice, {
      rate: '+5%',
      pitch: '+0Hz'
    });

    const result = await tts.synthesize();
    const arrayBuffer = await result.audio.arrayBuffer();
    const base64Audio = Buffer.from(arrayBuffer).toString('base64');

    res.status(200).json({ audioBase64: base64Audio });
  } catch (error) {
    res.status(500).json({ error: 'TTS Generation Failed: ' + error.message });
  }
}
