/**
 * Captura efêmera de áudio no navegador (RAM apenas).
 * Nenhum áudio é persistido em disco ou Storage de nuvem.
 */

export const MIN_RECORDING_DURATION_MS = 3500;

export function isRecordingTooShort(durationMs: number): boolean {
  return durationMs < MIN_RECORDING_DURATION_MS;
}

export interface RecordedAudio {
  blob: Blob;
  mimeType: string;
  durationSec: number;
  durationMs: number;
}

const PREFERRED_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
];

export function pickSupportedAudioMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return 'audio/webm';
  for (const mime of PREFERRED_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(mime)) {
      return mime;
    }
  }
  return 'audio/webm';
}

export class EphemeralAudioRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private chunks: Blob[] = [];
  private startedAt = 0;
  private activeMimeType = 'audio/webm';

  /**
   * Varredura de segurança na memória local antes de abrir nova gravação.
   */
  public purgeMemoryBuffers(): void {
    this.chunks = [];
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
    this.analyser = null;
    this.mediaRecorder = null;
  }

  public getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }

  public async start(): Promise<void> {
    this.purgeMemoryBuffers();

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: 16000,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    // Configura AnalyserNode para onda sonora em tempo real
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioCtx) {
      this.audioContext = new AudioCtx();
      const source = this.audioContext.createMediaStreamSource(this.stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 64;
      source.connect(this.analyser);
    }

    this.activeMimeType = pickSupportedAudioMimeType();
    this.mediaRecorder = new MediaRecorder(this.stream, {
      mimeType: this.activeMimeType,
      audioBitsPerSecond: 16000, // ~120 KB/min, ultra-leve e rápido para upload clínico
    });

    this.chunks = [];
    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        this.chunks.push(event.data);
      }
    };

    this.startedAt = Date.now();
    this.mediaRecorder.start(250);
  }

  public async stop(): Promise<RecordedAudio> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
        this.purgeMemoryBuffers();
        reject(new Error('Nenhuma gravação ativa.'));
        return;
      }

      const recorder = this.mediaRecorder;
      recorder.onstop = () => {
        const durationMs = Math.max(0, Date.now() - this.startedAt);
        const durationSec = Math.max(1, Math.round(durationMs / 1000));
        const cleanMime = this.activeMimeType.split(';')[0] || 'audio/webm';
        const blob = new Blob(this.chunks, { type: cleanMime });
        // Zera imediatamente os chunks internos em RAM
        this.purgeMemoryBuffers();
        resolve({
          blob,
          mimeType: cleanMime,
          durationSec,
          durationMs,
        });
      };

      recorder.onerror = () => {
        this.purgeMemoryBuffers();
        reject(new Error('Falha ao finalizar gravação de áudio.'));
      };

      recorder.stop();
    });
  }

  public cancel(): void {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.onstop = null;
      this.mediaRecorder.stop();
    }
    this.purgeMemoryBuffers();
  }
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}
