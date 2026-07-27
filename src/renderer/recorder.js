/**
 * Recording audio inside the app.
 *
 * MediaRecorder gives us WebM/Opus, which the game cannot read, so the bytes
 * go to the main process and come back as WAV (or OGG for chatter packs)
 * through the same converter everything else uses.
 */

export class Recorder {
  constructor() {
    this.media = null;
    this.chunks = [];
    this.stream = null;
    this.startedAt = 0;
    this.onTick = null;
    this.timer = null;
  }

  get recording() {
    return Boolean(this.media && this.media.state === 'recording');
  }

  /** Asks for the microphone. Rejects with something readable if refused. */
  async start() {
    if (this.recording) return;

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
    } catch (err) {
      if (err.name === 'NotAllowedError') throw new Error('Microphone access was refused');
      if (err.name === 'NotFoundError') throw new Error('No microphone found');
      throw err;
    }

    this.chunks = [];
    this.media = new MediaRecorder(this.stream, { mimeType: 'audio/webm' });
    this.media.addEventListener('dataavailable', (e) => {
      if (e.data && e.data.size) this.chunks.push(e.data);
    });
    this.media.start();
    this.startedAt = Date.now();

    if (this.onTick) {
      this.timer = setInterval(() => this.onTick((Date.now() - this.startedAt) / 1000), 100);
    }
  }

  /** Stops and returns the raw bytes, or null if nothing was captured. */
  async stop() {
    if (!this.media) return null;

    const done = new Promise((resolve) => {
      this.media.addEventListener('stop', resolve, { once: true });
    });
    this.media.stop();
    await done;

    clearInterval(this.timer);
    this.timer = null;
    for (const track of this.stream.getTracks()) track.stop();

    const blob = new Blob(this.chunks, { type: 'audio/webm' });
    this.media = null;
    this.stream = null;
    this.chunks = [];

    if (!blob.size) return null;
    return { bytes: await blob.arrayBuffer(), seconds: (Date.now() - this.startedAt) / 1000 };
  }

  cancel() {
    if (this.media && this.media.state !== 'inactive') this.media.stop();
    clearInterval(this.timer);
    if (this.stream) for (const track of this.stream.getTracks()) track.stop();
    this.media = null;
    this.stream = null;
    this.chunks = [];
  }
}

/**
 * Wires a record button, a timer readout and a stop button into one control.
 * `onSaved` receives { bytes, seconds } once a take finishes.
 */
export function attachRecorder(button, readout, onSaved, options = {}) {
  const recorder = new Recorder();
  const idleLabel = options.label || '● Record';

  recorder.onTick = (seconds) => {
    if (readout) readout.textContent = `${seconds.toFixed(1)}s`;
    if (options.maxSeconds && seconds >= options.maxSeconds) button.click();
  };

  button.addEventListener('click', async () => {
    if (recorder.recording) {
      button.textContent = idleLabel;
      button.classList.remove('recording');
      const take = await recorder.stop();
      if (readout) readout.textContent = '';
      if (take) onSaved(take);
      else onSaved(null);
      return;
    }

    try {
      await recorder.start();
      button.textContent = '■ Stop';
      button.classList.add('recording');
    } catch (err) {
      button.textContent = idleLabel;
      button.classList.remove('recording');
      if (options.onError) options.onError(err);
    }
  });

  return recorder;
}
