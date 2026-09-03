import { useEffect, useRef, useState } from 'react';

/**
 * Returns a stream where the audio track is heavily distorted (lowpass +
 * waveshaper + ring-modulator-ish detune) when `distorted` is true. Video is
 * passed through untouched — the visual distortion is applied via CSS in the
 * tile component.
 *
 * When `distorted` is false the original stream is returned unchanged.
 */
export function useDistortedStream(source: MediaStream | null, distorted: boolean): MediaStream | null {
  const ctxRef = useRef<AudioContext | null>(null);
  const srcNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const destRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const oscRef = useRef<OscillatorNode | null>(null);
  const [output, setOutput] = useState<MediaStream | null>(null);

  useEffect(() => {
    // Tear down any previous chain on every change.
    if (oscRef.current) {
      try { oscRef.current.stop(); } catch {}
      oscRef.current = null;
    }
    if (srcNodeRef.current) {
      try { srcNodeRef.current.disconnect(); } catch {}
      srcNodeRef.current = null;
    }
    if (destRef.current) {
      try { destRef.current.disconnect(); } catch {}
      destRef.current = null;
    }

    if (!source) {
      setOutput(null);
      return;
    }

    if (!distorted) {
      setOutput(source);
      return;
    }

    // Build the distortion chain.
    let ctx = ctxRef.current;
    if (!ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new Ctx();
      ctxRef.current = ctx;
    }
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const audioTracks = source.getAudioTracks();
    if (audioTracks.length === 0) {
      // No audio — nothing to distort. Pass video through.
      setOutput(source);
      return;
    }

    try {
      const audioOnly = new MediaStream(audioTracks);
      const srcNode = ctx.createMediaStreamSource(audioOnly);
      srcNodeRef.current = srcNode;

      // Lowpass to muffle.
      const lowpass = ctx.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = 700;
      lowpass.Q.value = 0.4;

      // Waveshaper for harmonic distortion.
      const shaper = ctx.createWaveShaper();
      const curve = new Float32Array(256);
      for (let i = 0; i < 256; i++) {
        const x = (i / 255) * 2 - 1;
        curve[i] = Math.tanh(x * 4) * 0.6;
      }
      shaper.curve = curve;
      shaper.oversample = '2x';

      // Ring-modulator-ish: multiply by a slow oscillator via a gain node.
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const osc = ctx.createOscillator();
      osc.frequency.value = 35; // low-frequency wobble
      osc.type = 'sawtooth';
      osc.connect(gain.gain);
      osc.start();
      oscRef.current = osc;

      // Final mixdown gain — dampen overall loudness because waveshaper +
      // ring-mod can clip easily.
      const out = ctx.createGain();
      out.gain.value = 0.85;

      // Routing: src → lowpass → shaper → (× wobble) → out → destination.
      srcNode.connect(lowpass);
      lowpass.connect(shaper);
      shaper.connect(gain);
      gain.connect(out);
      // Also pass a small dry signal through to keep some intelligibility.
      const dry = ctx.createGain();
      dry.gain.value = 0.25;
      shaper.connect(dry);
      dry.connect(out);

      const dest = ctx.createMediaStreamDestination();
      out.connect(dest);
      destRef.current = dest;

      const processedAudio = dest.stream.getAudioTracks()[0];
      const videoTracks = source.getVideoTracks();
      const merged = new MediaStream([processedAudio, ...videoTracks]);
      setOutput(merged);
    } catch (e) {
      // If anything in the audio graph blew up, fall back to the original.
      console.warn('audio distortion failed, falling back', e);
      setOutput(source);
    }

    return () => {
      if (oscRef.current) {
        try { oscRef.current.stop(); } catch {}
        oscRef.current = null;
      }
      if (srcNodeRef.current) {
        try { srcNodeRef.current.disconnect(); } catch {}
        srcNodeRef.current = null;
      }
      if (destRef.current) {
        try { destRef.current.disconnect(); } catch {}
        destRef.current = null;
      }
    };
  }, [source, distorted]);

  return output;
}
