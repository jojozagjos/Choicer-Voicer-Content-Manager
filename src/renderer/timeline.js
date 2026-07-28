/**
 * The clip timeline.
 *
 * A canvas showing the video's audio as a waveform with every clip laid over
 * it as a block. Blocks can be dragged to move a clip, or grabbed by an edge
 * to change where it starts and ends, and dragging empty space marks out a new
 * one. The point is to see the whole dub at once rather than reasoning about
 * timestamps as numbers.
 *
 * Canvas rather than DOM because a hundred clips over a two minute waveform is
 * thousands of elements, and dragging one of them should not cost a layout.
 */

const EDGE_GRAB = 7;      // pixels either side of a boundary that resize
const MIN_CLIP = 0.15;    // seconds, below which a clip is not worth having
const RULER_H = 18;
const HOLD_TO_CREATE = 320; // ms of holding still before a drag marks a clip

// Dragging a clip's body used to move it, which meant panning across a busy
// timeline knocked clips out of time. Moving now needs the grip: the ribbed bar
// along the top of a block. Everywhere else, left-drag pans.
const GRIP_H = 11;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export class Timeline {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.duration = 0;
    this.peaks = null;
    this.clips = [];
    this.playhead = 0;
    this.selected = null;
    this.maxClip = options.maxClip || 6;

    // View window, in seconds. Zooming narrows it.
    this.viewStart = 0;
    this.viewEnd = 0;

    this.drag = null;
    this.hover = null;
    this.pending = null;    // the range being marked out in add mode

    // Dragging empty space used to create clips, which meant every attempt to
    // pan made one by accident. Panning is the default; creating is a mode you
    // choose.
    this.mode = 'select';

    this.onSeek = null;
    this.onSelect = null;
    this.onCommit = null;   // (clip, {start, duration, resized}) once a drag ends
    this.onCreate = null;   // (start, duration) once a range is marked out
    this.onModeChange = null;

    this._bind();

    // Colours are read from CSS variables at paint time, so a theme change has
    // to trigger a repaint or the timeline keeps the old palette until the
    // next interaction.
    this._themeWatch = new MutationObserver(() => this.draw());
    this._themeWatch.observe(document.documentElement, {
      attributes: true, attributeFilter: ['data-theme'],
    });
  }

  destroy() {
    if (this._themeWatch) this._themeWatch.disconnect();
    if (this._raf) cancelAnimationFrame(this._raf);
  }

  /**
   * Follows a media element frame by frame. `timeupdate` only fires a few
   * times a second, which made the playhead jump rather than travel.
   */
  follow(media) {
    const tick = () => {
      if (this.playhead !== media.currentTime) {
        this.playhead = media.currentTime;
        this.draw();
      }
      this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
  }

  setDuration(seconds) {
    this.duration = seconds || 0;
    if (!this.viewEnd) this.viewEnd = this.duration;
    this.draw();
  }

  setPeaks(peaks) {
    this.peaks = peaks;
    this.draw();
  }

  setClips(clips) {
    this.clips = clips || [];
    this.draw();
  }

  setPlayhead(time) {
    this.playhead = time;
    this.draw();
  }

  select(base) {
    this.selected = base;
    this.draw();
  }

  // Coordinate helpers

  get viewSpan() {
    return Math.max(0.05, this.viewEnd - this.viewStart);
  }

  timeToX(time) {
    const { width } = this.canvas.getBoundingClientRect();
    return ((time - this.viewStart) / this.viewSpan) * width;
  }

  xToTime(x) {
    const { width } = this.canvas.getBoundingClientRect();
    return this.viewStart + (x / width) * this.viewSpan;
  }

  /** Zooms around a point so the time under the cursor stays put. */
  zoomAt(x, factor) {
    const anchor = this.xToTime(x);
    const span = clamp(this.viewSpan * factor, 0.5, this.duration || 1);
    let start = anchor - ((anchor - this.viewStart) / this.viewSpan) * span;
    start = clamp(start, 0, Math.max(0, this.duration - span));
    this.viewStart = start;
    this.viewEnd = start + span;
    this.draw();
  }

  panBy(seconds) {
    const span = this.viewSpan;
    this.viewStart = clamp(this.viewStart + seconds, 0, Math.max(0, this.duration - span));
    this.viewEnd = this.viewStart + span;
    this.draw();
  }

  // Hit testing

  /** Where a clip's block sits, shared by the drawing and the hit testing. */
  clipBox(clip) {
    const { height } = this.canvas.getBoundingClientRect();
    return {
      left: this.timeToX(clip.time),
      right: this.timeToX(clip.time + Math.max(clip.duration || 0, MIN_CLIP)),
      y: RULER_H + 6,
      h: Math.max(8, height - RULER_H - 12),
    };
  }

  clipAt(x, y) {
    // Backwards, so the topmost of two stacked clips wins.
    for (let i = this.clips.length - 1; i >= 0; i--) {
      const clip = this.clips[i];
      const box = this.clipBox(clip);
      if (x >= box.left - EDGE_GRAB && x <= box.right + EDGE_GRAB) {
        const edge = Math.abs(x - box.left) <= EDGE_GRAB ? 'start'
          : Math.abs(x - box.right) <= EDGE_GRAB ? 'end' : null;
        // y is optional so callers that only care which clip is under the
        // cursor can leave it out.
        const onGrip = !edge && y != null && y >= box.y && y <= box.y + GRIP_H;
        return { clip, edge, onGrip };
      }
    }
    return null;
  }

  // Drawing

  draw() {
    const canvas = this.canvas;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(rect.width * dpr)) {
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
    }

    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);

    const css = getComputedStyle(document.documentElement);
    const colour = (name, fallback) => (css.getPropertyValue(name) || fallback).trim();

    const waveTop = RULER_H;
    const waveH = rect.height - RULER_H;

    this._drawRuler(ctx, rect, colour);
    this._drawWave(ctx, rect, waveTop, waveH, colour);
    this._drawClips(ctx, rect, waveTop, waveH, colour);
    this._drawPending(ctx, rect, waveTop, waveH, colour);
    this._drawPlayhead(ctx, rect, colour);
  }

  /** The range being marked out, so you can see the clip before committing. */
  _drawPending(ctx, rect, top, height, colour) {
    if (!this.pending) return;
    const { start, end } = this.pending;
    const left = this.timeToX(Math.min(start, end));
    const right = this.timeToX(Math.max(start, end));
    const length = Math.abs(end - start);

    ctx.fillStyle = `${colour('--ok', '#4ade80')}44`;
    ctx.strokeStyle = colour('--ok', '#4ade80');
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(left, top + 6, Math.max(2, right - left), height - 12, 4);
    ctx.fill();
    ctx.stroke();

    // Say how long it is and whether the game will accept it.
    const label = length > this.maxClip
      ? `${length.toFixed(2)}s, capped at ${this.maxClip}s`
      : length < MIN_CLIP ? `${length.toFixed(2)}s, too short`
        : `${length.toFixed(2)}s`;

    ctx.font = '600 11px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    const w = ctx.measureText(label).width + 10;
    const bx = Math.min(rect.width - w - 2, Math.max(2, right + 6));

    ctx.fillStyle = colour('--panel', '#172636');
    ctx.strokeStyle = colour('--ok', '#4ade80');
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(bx, top + 8, w, 20, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = colour('--text', '#e6f2fb');
    ctx.fillText(label, bx + 5, top + 18);
  }

  _drawRuler(ctx, rect, colour) {
    ctx.fillStyle = colour('--bg-sunken', '#08111a');
    ctx.fillRect(0, 0, rect.width, RULER_H);

    // Aim for a tick every ~80px, snapped to something a person would pick.
    const target = (this.viewSpan / rect.width) * 80;
    const steps = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
    const step = steps.find((s) => s >= target) || 600;

    ctx.strokeStyle = colour('--line', '#263a4f');
    ctx.fillStyle = colour('--muted', '#8ea9c0');
    ctx.font = '10px system-ui, sans-serif';
    ctx.lineWidth = 1;

    for (let t = Math.ceil(this.viewStart / step) * step; t <= this.viewEnd; t += step) {
      const x = Math.round(this.timeToX(t)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, RULER_H);
      ctx.stroke();
      const m = Math.floor(t / 60);
      const s = t % 60;
      ctx.fillText(`${m}:${s.toFixed(step < 1 ? 1 : 0).padStart(step < 1 ? 4 : 2, '0')}`, x + 3, 11);
    }
  }

  _drawWave(ctx, rect, top, height, colour) {
    ctx.fillStyle = colour('--bg-sunken', '#08111a');
    ctx.fillRect(0, top, rect.width, height);

    if (!this.peaks || !this.peaks.length || !this.duration) return;

    const mid = top + height / 2;
    ctx.fillStyle = colour('--line', '#263a4f');

    // One vertical bar per pixel, taken from the peak buckets in view.
    for (let x = 0; x < rect.width; x++) {
      const t0 = this.xToTime(x);
      const t1 = this.xToTime(x + 1);
      const i0 = Math.floor((t0 / this.duration) * this.peaks.length);
      const i1 = Math.max(i0 + 1, Math.floor((t1 / this.duration) * this.peaks.length));

      let peak = 0;
      for (let i = Math.max(0, i0); i < Math.min(this.peaks.length, i1); i++) {
        if (this.peaks[i] > peak) peak = this.peaks[i];
      }
      const h = Math.max(1, peak * (height / 2) * 0.92);
      ctx.fillRect(x, mid - h, 1, h * 2);
    }
  }

  _drawClips(ctx, rect, top, height, colour) {
    const accent = colour('--accent', '#5ecdf5');
    const ink = colour('--accent-ink', '#04222f');

    ctx.font = '11px system-ui, sans-serif';
    ctx.textBaseline = 'middle';

    for (const clip of this.clips) {
      const left = this.timeToX(clip.time);
      const right = this.timeToX(clip.time + Math.max(clip.duration || 0, MIN_CLIP));
      if (right < 0 || left > rect.width) continue;

      const w = Math.max(2, right - left);
      const isSelected = clip.base === this.selected;

      ctx.fillStyle = isSelected ? accent : `${accent}55`;
      ctx.strokeStyle = accent;
      ctx.lineWidth = isSelected ? 2 : 1;

      const y = top + 6;
      const h = height - 12;
      ctx.beginPath();
      ctx.roundRect(left, y, w, h, 4);
      ctx.fill();
      ctx.stroke();

      // The grip. Ribbed so it reads as the part you can pick the clip up by,
      // since dragging anywhere else pans instead.
      if (w > 14) {
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(left, y, w, GRIP_H, [4, 4, 0, 0]);
        ctx.clip();
        ctx.fillStyle = isSelected ? ink : accent;
        ctx.globalAlpha = isSelected ? 0.85 : 0.5;
        ctx.fillRect(left, y, w, GRIP_H);

        ctx.globalAlpha = 1;
        ctx.fillStyle = isSelected ? accent : ink;
        const midY = y + GRIP_H / 2;
        const cx = left + w / 2;
        for (const dx of [-4, 0, 4]) {
          ctx.fillRect(Math.round(cx + dx) - 0.5, midY - 2.5, 1, 5);
        }
        ctx.restore();
      }

      // Label only when there is room for it to mean anything.
      if (w > 34) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(left + 4, y + GRIP_H, w - 8, h - GRIP_H);
        ctx.clip();
        ctx.fillStyle = isSelected ? ink : colour('--text', '#e6f2fb');
        const label = clip.character || clip.caption || clip.base;
        ctx.fillText(label, left + 6, y + GRIP_H + (h - GRIP_H) / 2);
        ctx.restore();
      }
    }
  }

  _drawPlayhead(ctx, rect, colour) {
    const x = Math.round(this.timeToX(this.playhead)) + 0.5;
    if (x < 0 || x > rect.width) return;

    ctx.strokeStyle = colour('--bad', '#f87171');
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, rect.height);
    ctx.stroke();

    ctx.fillStyle = colour('--bad', '#f87171');
    ctx.beginPath();
    ctx.moveTo(x - 4, 0);
    ctx.lineTo(x + 4, 0);
    ctx.lineTo(x, 6);
    ctx.closePath();
    ctx.fill();
  }

  // Interaction

  _bind() {
    const canvas = this.canvas;

    // Right and middle drag pan, so the context menu must not interrupt.
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    canvas.addEventListener('pointerdown', (e) => {
      const x = e.offsetX;
      const onRuler = e.offsetY < RULER_H;

      // Middle or right button pans from anywhere, including over a clip.
      if (e.button === 1 || e.button === 2) {
        this.drag = { kind: 'pan', startX: x, startView: this.viewStart };
        canvas.setPointerCapture(e.pointerId);
        canvas.style.cursor = 'grabbing';
        return;
      }
      if (e.button !== 0) return;

      // The ruler always scrubs.
      if (onRuler) {
        this.drag = { kind: 'scrub' };
        if (this.onSeek) this.onSeek(clamp(this.xToTime(x), 0, this.duration));
        canvas.setPointerCapture(e.pointerId);
        return;
      }

      const hit = this.clipAt(x, e.offsetY);
      if (hit) {
        this.selected = hit.clip.base;
        if (this.onSelect) this.onSelect(hit.clip);
        canvas.setPointerCapture(e.pointerId);

        // Only the grip and the edges take hold of the clip. Dragging its body
        // pans, so sweeping across the timeline can never retime anything.
        if (hit.edge || hit.onGrip) {
          this.drag = {
            kind: hit.edge ? `resize-${hit.edge}` : 'move',
            clip: hit.clip,
            startX: x,
            originalTime: hit.clip.time,
            originalDuration: Math.max(hit.clip.duration || 0, MIN_CLIP),
            moved: false,
          };
        } else {
          this.drag = { kind: 'pan', startX: x, startView: this.viewStart };
        }
        this.draw();
        return;
      }

      // Empty space: a quick drag pans, but holding still first arms a new
      // clip. That way panning is the reflex and creating is deliberate,
      // without needing a mode to switch between.
      const at = clamp(this.xToTime(x), 0, this.duration);
      this.drag = { kind: 'maybe', startX: x, startView: this.viewStart, startTime: at };
      canvas.setPointerCapture(e.pointerId);

      this.drag.timer = setTimeout(() => {
        if (!this.drag || this.drag.kind !== 'maybe') return;
        this.drag = { kind: 'create', startX: x };
        this.pending = { start: at, end: at };
        canvas.style.cursor = 'crosshair';
        this.draw();
      }, HOLD_TO_CREATE);
    });

    canvas.addEventListener('pointermove', (e) => {
      const x = e.offsetX;

      if (!this.drag) {
        const hit = this.clipAt(x, e.offsetY);
        canvas.style.cursor = e.offsetY < RULER_H ? 'text'
          : hit && hit.edge ? 'ew-resize'
            : hit && hit.onGrip ? 'move' : 'grab';
        return;
      }

      // Moving before the hold expires means a pan was intended.
      if (this.drag.kind === 'maybe') {
        if (Math.abs(x - this.drag.startX) > 3) {
          clearTimeout(this.drag.timer);
          this.drag = { kind: 'pan', startX: this.drag.startX, startView: this.drag.startView };
        } else {
          return;
        }
      }

      const width = this.canvas.getBoundingClientRect().width;
      const deltaSeconds = ((x - this.drag.startX) / width) * this.viewSpan;
      if (Math.abs(x - this.drag.startX) > 3) this.drag.moved = true;

      if (this.drag.kind === 'scrub') {
        if (this.onSeek) this.onSeek(clamp(this.xToTime(x), 0, this.duration));
        this.draw();
        return;
      }

      if (this.drag.kind === 'pan') {
        const span = this.viewSpan;
        this.viewStart = clamp(this.drag.startView - deltaSeconds, 0, Math.max(0, this.duration - span));
        this.viewEnd = this.viewStart + span;
        canvas.style.cursor = 'grabbing';
        this.draw();
        return;
      }

      if (this.drag.kind === 'create') {
        this.pending.end = clamp(this.xToTime(x), 0, this.duration);
        this.draw();
        return;
      }

      const clip = this.drag.clip;
      if (this.drag.kind === 'move') {
        clip.time = clamp(this.drag.originalTime + deltaSeconds, 0, Math.max(0, this.duration - 0.05));
      } else if (this.drag.kind === 'resize-start') {
        const end = this.drag.originalTime + this.drag.originalDuration;
        const next = clamp(this.drag.originalTime + deltaSeconds, 0, end - MIN_CLIP);
        clip.time = next;
        clip.duration = Math.min(end - next, this.maxClip);
      } else {
        clip.duration = clamp(this.drag.originalDuration + deltaSeconds, MIN_CLIP, this.maxClip);
      }
      this.draw();
    });

    const finish = (e) => {
      if (!this.drag) return;
      const drag = this.drag;
      clearTimeout(drag.timer);
      this.drag = null;
      canvas.style.cursor = '';
      try { canvas.releasePointerCapture(e.pointerId); } catch { /* already released */ }

      // Released before the hold armed anything: a click on empty space, which
      // seeks and clears the selection.
      if (drag.kind === 'maybe') {
        if (this.onSeek) this.onSeek(clamp(drag.startTime, 0, this.duration));
        if (this.selected) {
          this.selected = null;
          if (this.onSelect) this.onSelect(null);
          this.draw();
        }
        return;
      }

      if (drag.kind === 'create') {
        const { start, end } = this.pending;
        this.pending = null;
        const length = Math.abs(end - start);
        if (length >= MIN_CLIP && this.onCreate) {
          this.onCreate(Math.min(start, end), Math.min(length, this.maxClip));
        }
        this.draw();
        return;
      }

      if (drag.kind === 'scrub' || drag.kind === 'pan') return;

      if (drag.moved && this.onCommit) {
        this.onCommit(drag.clip, {
          start: drag.clip.time,
          duration: drag.clip.duration,
          // Where it was, so the change can be undone.
          previousStart: drag.originalTime,
          previousDuration: drag.originalDuration,
          resized: drag.kind !== 'move',
        });
      }
    };

    canvas.addEventListener('pointerup', finish);
    canvas.addEventListener('pointercancel', finish);

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (e.shiftKey) this.panBy((e.deltaY / 200) * this.viewSpan);
      else this.zoomAt(e.offsetX, e.deltaY > 0 ? 1.2 : 1 / 1.2);
    }, { passive: false });

    canvas.addEventListener('dblclick', () => {
      this.viewStart = 0;
      this.viewEnd = this.duration;
      this.draw();
    });
  }
}

/**
 * Reduces decoded audio to one peak per bucket, which is all the waveform
 * needs and a fraction of the memory of the samples themselves.
 */
export function computePeaks(audioBuffer, buckets = 3000) {
  const channel = audioBuffer.getChannelData(0);
  const per = Math.max(1, Math.floor(channel.length / buckets));
  const peaks = new Float32Array(Math.ceil(channel.length / per));

  for (let i = 0; i < peaks.length; i++) {
    const from = i * per;
    const to = Math.min(channel.length, from + per);
    let peak = 0;
    for (let j = from; j < to; j++) {
      const v = channel[j] < 0 ? -channel[j] : channel[j];
      if (v > peak) peak = v;
    }
    peaks[i] = peak;
  }

  // Normalise so a quiet source still fills the lane.
  let loudest = 0;
  for (const p of peaks) if (p > loudest) loudest = p;
  if (loudest > 0) for (let i = 0; i < peaks.length; i++) peaks[i] /= loudest;

  return peaks;
}
