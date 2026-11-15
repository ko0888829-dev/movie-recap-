import React, { useState, useRef, useEffect } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import axios from 'axios';

export default function App() {
  const [ffmpegReady, setFfmpegReady] = useState(false);
  const ffmpegRef = useRef(new FFmpeg());

  const [videoFile, setVideoFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');

  // Script & Metadata
  const [rawTranscript, setRawTranscript] = useState('');
  const [narrationScript, setNarrationScript] = useState('');
  const [metadata, setMetadata] = useState({ title: '', caption: '', hashtags: [] });

  // Video Effects
  const [flipHorizontal, setFlipHorizontal] = useState(true);
  const [enableBlur, setEnableBlur] = useState(true);
  const [blurY, setBlurY] = useState(82); // % from top
  const [blurHeight, setBlurHeight] = useState(14); // % height
  const [finalVideoUrl, setFinalVideoUrl] = useState('');

  useEffect(() => {
    loadFFmpeg();
  }, []);

  const loadFFmpeg = async () => {
    try {
      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
      const ffmpeg = ffmpegRef.current;
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      });
      setFfmpegReady(true);
    } catch (err) {
      console.error('FFmpeg Load Error:', err);
    }
  };

  const handleVideoUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setVideoFile(file);
      setVideoUrl(URL.createObjectURL(file));
      setFinalVideoUrl('');
    }
  };

  // AI ဖြင့် ဇာတ်လမ်းပုံပြင်ပြော ဘာသာပြန်ခြင်း
  const handleTranslateStory = async () => {
    if (!rawTranscript.trim()) {
      alert('မူရင်း Subtitle စာသား (သို့) ဇာတ်လမ်းအကျဉ်း ထည့်ပေးပါ');
      return;
    }
    setLoading(true);
    setStatus('AI ဖြင့် ဇာတ်လမ်းခွဲခြမ်းစိတ်ဖြာပြီး မြန်မာပုံပြင်ပြောဟန် ဘာသာပြန်နေပါသည်...');
    try {
      const res = await axios.post('/api/translate', { transcriptText: rawTranscript });
      setNarrationScript(res.data.narrationScript);
      setMetadata({
        title: res.data.title,
        caption: res.data.caption,
        hashtags: res.data.hashtags || [],
      });
    } catch (err) {
      alert('Translation Error: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  };

  // AI Voice ထုတ်ခြင်း + Browser FFmpeg ဖြင့် Flip & Blur လုပ်ခြင်း
  const handleRenderFinalMovie = async () => {
    if (!videoFile || !narrationScript) {
      alert('Video ဖိုင်နှင့် မြန်မာစာသား ပြည့်စုံအောင် အရင်ထည့်ပါ');
      return;
    }
    if (!ffmpegReady) {
      alert('Video Engine (FFmpeg) Load လုပ်နေဆဲဖြစ်ပါသည်၊ ခဏစောင့်ပါ');
      return;
    }

    setLoading(true);
    try {
      // 1. Get AI Voiceover
      setStatus('၁/၂ - AI Voiceover အသံဖိုင် ထုတ်ယူနေပါသည်...');
      const ttsRes = await axios.post('/api/tts', { text: narrationScript });
      const audioBytes = Uint8Array.from(atob(ttsRes.data.audioBase64), (c) => c.charCodeAt(0));

      // 2. Process Video in Browser using FFmpeg
      setStatus('၂/၂ - Video ကို Flip, Blur နှင့် AI အသံ ပေါင်းစပ်နေပါသည်...');
      const ffmpeg = ffmpegRef.current;
      await ffmpeg.writeFile('input.mp4', await fetchFile(videoFile));
      await ffmpeg.writeFile('voice.mp3', audioBytes);

      let filters = [];
      let currentStream = '[0:v]';

      if (flipHorizontal) {
        filters.push(`${currentStream}hflip[flipped]`);
        currentStream = '[flipped]';
      }

      if (enableBlur) {
        // Dynamic percentage-based blur box on bottom subtitle area
        const yExpr = `ih*${(blurY / 100).toFixed(2)}`;
        const hExpr = `ih*${(blurHeight / 100).toFixed(2)}`;
        filters.push(
          `${currentStream}split=2[base][sub];` +
          `[sub]crop=iw:${hExpr}:0:${yExpr},boxblur=15:5[blurred];` +
          `[base][blurred]overlay=0:${yExpr}[outv]`
        );
        currentStream = '[outv]';
      }

      const args = ['-i', 'input.mp4', '-i', 'voice.mp3'];
      if (filters.length > 0) {
        args.push('-filter_complex', filters.join(';'), '-map', currentStream);
      } else {
        args.push('-map', '0:v');
      }
      args.push('-map', '1:a', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-shortest', 'output.mp4');

      await ffmpeg.exec(args);

      const data = await ffmpeg.readFile('output.mp4');
      const blob = new Blob([data.buffer], { type: 'video/mp4' });
      setFinalVideoUrl(URL.createObjectURL(blob));
    } catch (err) {
      alert('Render Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <header className="border-b border-slate-800 pb-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-amber-400">🎬 AI Movie Recap Studio</h1>
            <p className="text-xs text-slate-400">Storytelling Translation • AI Voice • Flip • Hardsub Blur</p>
          </div>
          <span className={`text-xs px-3 py-1 rounded-full ${ffmpegReady ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
            {ffmpegReady ? 'Engine Ready' : 'Loading Engine...'}
          </span>
        </header>

        {loading && (
          <div className="bg-slate-900 border border-amber-500/40 p-4 rounded-xl text-center animate-pulse">
            <p className="text-amber-400 font-medium text-sm">{status}</p>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-6">
          {/* Left: Video & Visual Effects */}
          <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 space-y-4">
            <h2 className="font-semibold text-amber-400">၁။ Video နှင့် Flip / Blur ချိန်ညှိရန်</h2>
            
            <input
              type="file"
              accept="video/*"
              onChange={handleVideoUpload}
              className="block w-full text-xs text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-amber-500 file:text-slate-950 file:font-semibold"
            />

            {videoUrl && (
              <div className="relative overflow-hidden rounded-xl bg-black">
                <video
                  src={videoUrl}
                  controls
                  className={`w-full transition-transform ${flipHorizontal ? '-scale-x-100' : ''}`}
                />
                {enableBlur && (
                  <div
                    style={{ top: `${blurY}%`, height: `${blurHeight}%`, left: 0, right: 0 }}
                    className="absolute backdrop-blur-md bg-black/30 border-y border-amber-400/60 pointer-events-none flex items-center justify-center"
                  >
                    <span className="text-[10px] text-amber-300">Subtitle Blur Area</span>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-3 pt-2">
              <label className="flex items-center justify-between bg-slate-800/60 p-3 rounded-xl cursor-pointer">
                <span className="text-sm">🔄 ဘယ်/ညာ ပြောင်းမည် (Flip)</span>
                <input type="checkbox" checked={flipHorizontal} onChange={(e) => setFlipHorizontal(e.target.checked)} className="w-4 h-4 accent-amber-500" />
              </label>

              <div className="bg-slate-800/60 p-3 rounded-xl space-y-2">
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-sm">💧 စာတန်းဟောင်း ဝါးမည် (Blur)</span>
                  <input type="checkbox" checked={enableBlur} onChange={(e) => setEnableBlur(e.target.checked)} className="w-4 h-4 accent-amber-500" />
                </label>
                {enableBlur && (
                  <div className="grid grid-cols-2 gap-3 text-xs pt-1">
                    <div>
                      <span className="text-slate-400">အပေါ်/အောက် ({blurY}%)</span>
                      <input type="range" min="0" max="90" value={blurY} onChange={(e) => setBlurY(Number(e.target.value))} className="w-full accent-amber-500" />
                    </div>
                    <div>
                      <span className="text-slate-400">အထူ ({blurHeight}%)</span>
                      <input type="range" min="5" max="30" value={blurHeight} onChange={(e) => setBlurHeight(Number(e.target.value))} className="w-full accent-amber-500" />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right: Story Translation & AI Voice */}
          <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 space-y-4">
            <h2 className="font-semibold text-amber-400">၂။ ပုံပြင်ပြော ဘာသာပြန် & AI Voice</h2>

            <div>
              <label className="text-xs text-slate-400 block mb-1">မူရင်း Subtitle စာသား (တရုတ်/အင်္ဂလိပ်) ထည့်ပါ</label>
              <textarea
                rows={4}
                placeholder="မူရင်းစာတန်းများကို ဒီမှာ Paste ချပါ..."
                value={rawTranscript}
                onChange={(e) => setRawTranscript(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs focus:border-amber-500 outline-none"
              />
              <button
                onClick={handleTranslateStory}
                disabled={loading}
                className="w-full mt-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold py-2.5 rounded-xl text-sm transition"
              >
                ✨ ပုံပြင်ပြောပုံစံ ဘာသာပြန်မည်
              </button>
            </div>

            <div>
              <label className="text-xs text-slate-400 block mb-1">မြန်မာ Voiceover Script (ပြင်ဆင်နိုင်သည်)</label>
              <textarea
                rows={5}
                value={narrationScript}
                onChange={(e) => setNarrationScript(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs leading-relaxed focus:border-amber-500 outline-none"
              />
            </div>

            {metadata.title && (
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs space-y-1">
                <p><strong className="text-amber-400">Title:</strong> {metadata.title}</p>
                <p><strong className="text-amber-400">Caption:</strong> {metadata.caption}</p>
                <p><strong className="text-amber-400">Hashtags:</strong> {metadata.hashtags.join(' ')}</p>
              </div>
            )}

            <button
              onClick={handleRenderFinalMovie}
              disabled={loading || !videoFile || !narrationScript}
              className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 text-slate-950 font-bold py-3 rounded-xl text-sm transition"
            >
              🎬 AI Voice ထည့်ပြီး Movie ထုတ်မည်
            </button>
          </div>
        </div>

        {/* Final Download Section */}
        {finalVideoUrl && (
          <div className="bg-slate-900 border border-emerald-500/50 p-6 rounded-2xl text-center space-y-4">
            <h3 className="text-lg font-bold text-emerald-400">✅ Movie အသင့်ဖြစ်ပါပြီ!</h3>
            <video src={finalVideoUrl} controls className="w-full max-h-80 rounded-xl bg-black mx-auto" />
            <a
              href={finalVideoUrl}
              download="movie_recap_burmese.mp4"
              className="inline-block bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold px-8 py-3 rounded-xl transition"
            >
              ⬇️ Video Download ဆွဲမည် (.mp4)
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
