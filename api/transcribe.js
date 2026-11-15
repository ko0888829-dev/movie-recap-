export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { audioUrl } = req.body;
    const response = await fetch('https://api.assemblyai.com/v2/transcript', {
      method: 'POST',
      headers: {
        authorization: process.env.ASSEMBLYAI_API_KEY,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        audio_url: audioUrl,
        language_detection: true,
      }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Transcription start failed');

    // Polling until completed
    let transcriptData;
    while (true) {
      const checkRes = await fetch(`https://api.assemblyai.com/v2/transcript/${data.id}`, {
        headers: { authorization: process.env.ASSEMBLYAI_API_KEY },
      });
      transcriptData = await checkRes.json();
      if (transcriptData.status === 'completed') break;
      if (transcriptData.status === 'error') throw new Error(transcriptData.error);
      await new Promise((r) => setTimeout(r, 2500));
    }

    res.status(200).json({ text: transcriptData.text });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
