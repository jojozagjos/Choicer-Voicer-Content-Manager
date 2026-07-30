/**
 * Recording audio inside the app.
 *
 * MediaRecorder gives us WebM/Opus, which the game cannot read, so the bytes
 * go to the main process and come back as WAV (or OGG for chatter packs)
 * through the same converter everything else uses.
 */

/**
 * How long to let the microphone settle before recording anything.
 *
 * A capture device does not deliver full level the instant it opens. The first
 * fraction of a second comes up from nothing while the operating system's audio
 * stack starts the stream, and recording from the moment getUserMedia resolved
 * captured that climb as a fade in on the front of every take.
 *
 * The cost is a short pause between pressing record and the timer moving, which
 * is a far smaller thing than the beginning of the first word arriving quiet.
 */
const SETTLE_MS = 250;

export class Recorder {
  constructor() {
    this.media = null;
    this.chunks = [];
    this.stream = null;
    this.startedAt = 0;
    this.onTick = null;
    this.timer = null;
    // Bumped by cancel(), so a take called off while the microphone is still
    // settling does not start recording a moment later.
    this.generation = 0;
  }

  get recording() {
    return Boolean(this.media && this.media.state === 'recording');
  }

  /** Asks for the microphone. Rejects with something readable if refused. */
  async start() {
    if (this.recording) return;

    const mine = ++this.generation;

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
    } catch (err) {
      if (err.name === 'NotAllowedError') throw new Error('Microphone access was refused');
      if (err.name === 'NotFoundError') throw new Error('No microphone found');
      throw err;
    }

    // See SETTLE_MS. The stream is open at this point but not yet at level.
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));

    // Called off, or started again, while we were waiting.
    if (mine !== this.generation) {
      for (const track of this.stream.getTracks()) track.stop();
      this.stream = null;
      return;
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
    this.generation++;
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
  // A compact button gets compact labels. The reaction slots use a 24 pixel
  // icon button, and putting the words in it pushed it out of its own row.
  const idleLabel = options.label || (button.classList.contains('icon-btn') ? '●' : '● Record');
  const busyLabel = options.stopLabel || (button.classList.contains('icon-btn') ? '■' : '■ Stop');
  const readyLabel = button.classList.contains('icon-btn') ? '…' : 'Getting ready…';

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

    // A chance to ask before the microphone opens, for a slot that already
    // holds a sound. Answering no leaves everything as it was.
    if (options.beforeStart) {
      button.disabled = true;
      let go = false;
      try { go = await options.beforeStart(); } finally { button.disabled = false; }
      if (!go) return;
    }

    // Opening the microphone and letting it settle takes a moment, and a button
    // that does nothing at all in that moment reads as a click that missed. It
    // says so instead, and cannot be pressed again until recording has started.
    try {
      button.disabled = true;
      button.textContent = readyLabel;
      await recorder.start();
      button.textContent = busyLabel;
      button.classList.add('recording');
    } catch (err) {
      button.textContent = idleLabel;
      button.classList.remove('recording');
      if (options.onError) options.onError(err);
    } finally {
      button.disabled = false;
    }
  });

  return recorder;
}
