import { useState, useRef, useCallback } from 'react';

export default function RecordButton() {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number>(0);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });

      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `quiz-dungeon-${new Date().toISOString().slice(0, 16)}.webm`;
        a.click();
        URL.revokeObjectURL(url);
        stream.getTracks().forEach(t => t.stop());
        clearInterval(timerRef.current);
        setSeconds(0);
      };

      recorder.start(1000);
      recorderRef.current = recorder;
      setRecording(true);
      setSeconds(0);
      timerRef.current = window.setInterval(() => setSeconds(s => s + 1), 1000);

      stream.getVideoTracks()[0].onended = () => {
        if (recorderRef.current?.state === 'recording') {
          recorderRef.current.stop();
          setRecording(false);
        }
      };
    } catch {
      // User cancelled
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop();
      setRecording(false);
    }
  }, []);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  if (recording) {
    return (
      <button
        onClick={stopRecording}
        className="fixed top-3 left-3 z-50 flex items-center gap-2 glass-panel rounded-full px-4 py-2 border border-red-500/40"
      >
        <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
        <span className="text-red-300 text-sm font-bold font-mono">{formatTime(seconds)}</span>
        <span className="text-gray-400 text-xs">⏹ Стоп</span>
      </button>
    );
  }

  return (
    <button
      onClick={startRecording}
      className="fixed top-3 left-3 z-50 glass-panel rounded-full w-10 h-10 flex items-center justify-center text-sm border border-gray-600/30 hover:border-gray-400/50 transition-all opacity-40 hover:opacity-100"
      title="Записать игру"
    >
      🔴
    </button>
  );
}
