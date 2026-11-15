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
  const [progress, setProgress] = useState(0);

  // Settings
  const [voiceType, setVoiceType] = useState('my-MM-ThihaNeural');
  const [flipHorizontal, setFlipHorizontal] = useState(true);
  const [enableBlur, setEnableBlur] = useState(true);
  const [blurY, setBlurY] = useState(82);
  const [blurHeight, setBlurHeight] = useState(14);

  // Outputs
  const [segments, setSegments] = useState([]);
  const [metadata, setMetadata] = useState({ title: '', caption: '', hashtags: [] });
  const [thumbnailUrl, setThumbnailUrl] = useState('');
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
      setThumbnailUrl('');
      setSegments([]);
    }
  };

  // ArrayBuffer to Base64 Helper
  const arrayBufferToBase64 = (buffer) => {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  };

  // ONE-CLICK FULL AUTOMATION PIPELINE
  const handleFullAutoProcess = async () => {
    if (!videoFile) {
      alert('အရင်ဆုံး Movie Video ဖိုင် ရွေးချယ်ပေးပါ');
      return;
    }
    if (!ffmpegReady) {
      alert('Video Engine (FFmpeg) ပြင်ဆင်နေဆဲဖြစ်ပါသည်၊ ခဏစောင့်ပါ');
      return;
    }

    setLoading(true);
    setProgress(10);
    const ffmpeg = ffmpegRef.current;

    try {
      // STEP 1: Extract compressed MP3 audio from video in browser
      setStatus('၁/၄ - Video ထဲမှ အသံဖိုင်ကို အလိုအလျောက် ခွဲထုတ်နေပါသည်...');
      await ffmpeg.writeFile('input.mp4', await fetchFile(videoFile));
      await ffmpeg.exec(['-i', 'input.mp4', '-vn', '-ar', '16000', '-ac', '1', '-b:a', '32k', 'extracted.mp3']);
      
      const audioData = await ffmpeg.readFile('extracted.mp3');
      const audioBase64 = arrayBufferToBase64(audioData.buffer);
      setProgress(30);

      // STEP 2: AI Audio Transcription + Time-Synced Burmese Storytelling + Thumbnail
      setStatus('၂/၄ - AI ဖြင့် ဇာတ်လမ်းနားထောင်ပြီး အချိန်ကိုက် မြန်မာဘာသာပြန်နှင့် Thumbnail ထုတ်နေပါသည်...');
      const aiRes = await axios.post('/api/auto-process', { audioBase64 });
      const { segments: syncedSegments, title, caption, hashtags, thumbnailUrl: thumb } = aiRes.data;

      setSegments(syncedSegments || []);
      setMetadata({ title, caption, hashtags: hashtags || [] });
      setThumbnailUrl(thumb);
      setProgress(55);

      // STEP 3: Generate Time-Synced Burmese AI Voiceover for each segment
      setStatus(`၃/၄ - အချိန်ကိုက် မြန်မာ AI Voiceover (${syncedSegments.length} ပိုင်း) ထုတ်ယူနေပါသည်...`);
      const validSegments = [];
      for (let i = 0; i < syncedSegments.length; i++) {
        const seg = syncedSegments[i];
        if (!seg.burmeseText?.trim()) continue;
        
        const ttsRes = await axios.post('/api/tts', { text: seg.burmeseText, voice: voiceType });
        const voiceBytes = Uint8Array.from(atob(ttsRes.data.audioBase64), (c) => c.charCodeAt(0));
        const fileName = `seg_${i}.mp3`;
        await ffmpeg.writeFile(fileName, voiceBytes);
        validSegments.push({ ...seg, fileName });
      }
      setProgress(80);

      // STEP 4: Merge Time-Synced Audio + Flip + Subtitle Blur into Final Movie
      setStatus('၄/၄ - Flip, စာတန်းဝါးခြင်း နှင့် အချိန်ကိုက် AI Voice ပေါင်းစပ်၍ Final Movie ထုတ်နေပါသည်...');
      
      const args = ['-i', 'input.mp4'];
      validSegments.forEach((seg) => {
        args.push('-i', seg.fileName);
      });

      let filterComplex = [];
      let currentVideo = '[0:v]';

      if (flipHorizontal) {
        filterComplex.push(`${currentVideo}hflip[flipped]`);
        currentVideo = '[flipped]';
      }

      if (enableBlur) {
        const yExpr = `ih*${(blurY / 100).toFixed(2)}`;
        const hExpr = `ih*${(blurHeight / 100).toFixed(2)}`;
        filterComplex.push(
          `${currentVideo}split=2[base][sub];` +
          `[sub]crop=iw:${hExpr}:0:${yExpr},boxblur=15:5[blurred];` +
          `[base][blurred]overlay=0:${yExpr}[outv]`
        );
        currentVideo = '[outv]';
      }

      // Sync each voiceover segment to exact startSec timestamp using adelay
      if (validSegments.length > 0) {
        const delayedLabels = [];
        validSegments.forEach((seg, idx) => {
          const inputIdx = idx + 1;
          const delayMs = Math.max(0, Math.round(seg.startSec * 1000));
          const label = `[a${idx}]`;
          filterComplex.push(`[${inputIdx}:a]adelay=${delayMs}|${delayMs}${label}`);
          delayedLabels.push(label);
        });
        filterComplex.push(`${delayedLabels.join('')}amix=inputs=${validSegments.length}:normalize=0[outa]`);
      }

      if (filterComplex.length > 0) {
        args.push('-filter_complex', filterComplex.join(';'));
      }

      args.push('-map', filterComplex.some(f => f.includes('[outv]') || f.includes('[flipped]')) ? currentVideo : '0:v');
      
      if (validSegments.length > 0) {
        args.push('-map', '[outa]');
      } else {
        args.push('-map', '0:a?');
      }

      args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-shortest', 'final_movie.mp4');

      await ffmpeg.exec(args);

      const finalData = await ffmpeg.readFile('final_movie.mp4');
      const finalBlob = new Blob([finalData.buffer], { type: 'video/mp4' });
      setFinalVideoUrl(URL.createObjectURL(finalBlob));
      setProgress(100);
    } catch (err) {
      console.error(err);
      alert('Error: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-6">
      <div className="max-w-3xl mx-auto space-y-5">
        <header className="border-b border-slate-800 pb-3 flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold text-amber-400">🎬 Auto Movie Recap Studio</h1>
            <p className="text-xs text-slate-400">One-Click Auto Dubbing • Time-Synced Voice • Flip & Blur • Thumbnail</p>
          </div>
          <span className={`text-xs px-2.5 py-1 rounded-full ${ffmpegReady ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
            {ffmpegReady ? 'Ready' : 'Loading...'}
          </span>
        </header>

        {/* STEP 1: VIDEO UPLOAD & BLUR/FLIP SETUP */}
        <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="font-semibold text-amber-400 text-sm">၁။ Video ထည့်ပြီး Flip နှင့် စာတန်းဝါးမည့်နေရာ ချိန်ညှိပါ</h2>
            <select
              value={voiceType}
              onChange={(e) => setVoiceType(e.target.value)}
              className="bg-slate-800 text-xs rounded-lg px-2.5 py-1.5 border border-slate-700 text-amber-300"
            >
              <option value="my-MM-ThihaNeural">👨 ယောက်ျားလေးအသံ (သီဟ)</option>
              <option value="my-MM-NilarNeural">👩 မိန်းကလေးအသံ (နီလာ)</option>
            </select>
          </div>

          <input
            type="file"
            accept="video/*"
            onChange={handleVideoUpload}
            className="block w-full text-xs text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-amber-500 file:text-slate-950 file:font-bold cursor-pointer"
          />

          {videoUrl && (
            <div className="relative overflow-hidden rounded-xl bg-black border border-slate-800">
              <video
                src={videoUrl}
                controls
                className={`w-full max-h-80 transition-transform ${flipHorizontal ? '-scale-x-100' : ''}`}
              />
              {enableBlur && (
                <div
                  style={{ top: `${blurY}%`, height: `${blurHeight}%`, left: 0, right: 0 }}
                  className="absolute backdrop-blur-md bg-black/30 border-y border-amber-400/70 pointer-events-none flex items-center justify-center"
                >
                  <span className="text-[10px] text-amber-300 font-medium">Subtitle Blur Area</span>
                </div>
              )}
            </div>
          )}

          <div className="space-y-3">
            <label className="flex items-center justify-between bg-slate-800/60 p-3 rounded-xl cursor-pointer">
              <span className="text-sm">🔄 ဘယ်/ညာ ပြောင်းမည် (Flip)</span>
              <input type="checkbox" checked={flipHorizontal} onChange={(e) => setFlipHorizontal(e.target.checked)} className="w-5 h-5 accent-amber-500" />
            </label>

            <div className="bg-slate-800/60 p-3 rounded-xl space-y-2">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-sm">💧 စာတန်းဟောင်း ဝါးမည် (Blur)</span>
                <input type="checkbox" checked={enableBlur} onChange={(e) => setEnableBlur(e.target.checked)} className="w-5 h-5 accent-amber-500" />
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

          {/* ONE-CLICK ACTION BUTTON */}
          <button
            onClick={handleFullAutoProcess}
            disabled={loading || !videoFile || !ffmpegReady}
            className="w-full bg-gradient-to-r from-amber-500 to-emerald-500 hover:opacity-90 disabled:opacity-40 text-slate-950 font-extrabold py-3.5 rounded-xl text-sm shadow-lg transition"
          >
            🚀 Auto ဘာသာပြန် + အချိန်ကိုက် Voice + Movie & Thumbnail ထုတ်မည်
          </button>

          {loading && (
            <div className="bg-slate-950 border border-amber-500/40 p-4 rounded-xl space-y-2">
              <div className="flex justify-between text-xs text-amber-400 font-medium">
                <span>{status}</span>
                <span>{progress}%</span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-2">
                <div className="bg-amber-400 h-2 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}
        </div>

        {/* FINAL OUTPUTS: VIDEO + THUMBNAIL + METADATA */}
        {(finalVideoUrl || thumbnailUrl) && (
          <div className="bg-slate-900 border border-emerald-500/40 p-5 rounded-2xl space-y-5">
            <h2 className="text-lg font-bold text-emerald-400 text-center">✅ အားလုံး အသင့်ဖြစ်ပါပြီ!</h2>

            <div className="grid md:grid-cols-2 gap-4">
              {finalVideoUrl && (
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-3 text-center">
                  <p className="text-xs font-semibold text-emerald-400">🎬 Final Movie Recap (အချိန်ကိုက် AI Voice)</p>
                  <video src={finalVideoUrl} controls className="w-full rounded-lg bg-black" />
                  <a
                    href={finalVideoUrl}
                    download="auto_movie_recap.mp4"
                    className="block w-full bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold py-2.5 rounded-lg text-xs transition"
                  >
                    ⬇️ Movie Download ဆွဲမည် (.mp4)
                  </a>
                </div>
              )}

              {thumbnailUrl && (
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-3 text-center">
                  <p className="text-xs font-semibold text-amber-400">🖼️ AI Cover Thumbnail</p>
                  <img src={thumbnailUrl} alt="Thumbnail" className="w-full rounded-lg border border-slate-800" />
                  <a
                    href={thumbnailUrl}
                    target="_blank"
                    rel="noreferrer"
                    download="movie_thumbnail.jpg"
                    className="block w-full bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold py-2.5 rounded-lg text-xs transition"
                  >
                    ⬇️ Thumbnail Download ဆွဲမည် (.jpg)
                  </a>
                </div>
              )}
            </div>

            {metadata.title && (
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs space-y-1.5">
                <p><strong className="text-amber-400">Title:</strong> {metadata.title}</p>
                <p><strong className="text-amber-400">Caption:</strong> {metadata.caption}</p>
                <p><strong className="text-amber-400">Hashtags:</strong> {metadata.hashtags.join(' ')}</p>
              </div>
            )}

            {segments.length > 0 && (
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2 max-h-48 overflow-y-auto">
                <p className="text-xs font-semibold text-slate-400">⏱️ အချိန်ကိုက် မြန်မာစာသားများ:</p>
                {segments.map((seg, i) => (
                  <div key={i} className="text-xs border-b border-slate-900 pb-1">
                    <span className="text-amber-400 font-mono">[{seg.startSec}s - {seg.endSec}s]</span>{' '}
                    <span className="text-slate-200">{seg.burmeseText}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
