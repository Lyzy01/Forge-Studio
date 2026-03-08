// ============================================================
// BEATFORGE - Main Application
// ============================================================

// ─── STATE ─────────────────────────────────────────────────
const State = {
  user: null,
  guestMode: false,
  projectId: null,
  projectName: 'Untitled Project',
  currentTab: 'sequencer',
  activePattern: 0,
  bpm: 120,
  isPlaying: false,
  currentStep: -1,
  masterVol: 0.85,

  sequencer: {
    patterns: [createEmptyPattern()],
    activePattern: 0,
  },

  pianoRoll: {
    notes: [],
    loopBeats: 8,
    zoomX: 1,
    selectedInstrument: 8,
    activeNote: null,
    scrollX: 0,
    scrollY: 0,
  },

  synth: {
    osc1Type: 'sawtooth',
    osc2Type: 'square',
    osc2Detune: 7,
    osc1Vol: 0.7,
    osc2Vol: 0.3,
    filterType: 'lowpass',
    filterCutoff: 1800,
    filterRes: 4,
    attack: 0.01,
    decay: 0.15,
    sustain: 0.6,
    release: 0.35,
  },

  mixer: {
    masterVol: 0.85,
    channels: createMixerChannels(),
  },

  fx: {
    reverb: { wet: 0, size: 0.5 },
    delay: { wet: 0, time: 0.375, feedback: 0.35 },
    distortion: { wet: 0, drive: 0.3 },
  },

  projects: [],
};

function createEmptyPattern() {
  const CHANNEL_NAMES = [
    'Kick', 'Snare', 'Hi-Hat', 'Open HH',
    'Crash', 'Clap', 'Tom Hi', 'Tom Lo',
  ];
  return {
    name: 'Pattern 1',
    channels: CHANNEL_NAMES.map((name, i) => ({
      name,
      steps: new Array(16).fill(false),
      volume: 1.0,
      pan: 0,
      muted: false,
      solo: false,
    })),
  };
}

function createMixerChannels() {
  const names = ['Kick','Snare','Hi-Hat','Open HH','Crash','Clap','Tom Hi','Tom Lo','Synth','Aux 1'];
  return names.map((name, i) => ({
    name,
    volume: 1.0,
    pan: 0,
    muted: false,
    solo: false,
  }));
}

// ─── DOM HELPERS ───────────────────────────────────────────
const $ = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

// ─── INIT ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  checkAuth();
  setupTransport();
  setupTabs();
  renderSequencer();
  renderMixer();
  renderFX();
  renderSynth();
  setupPianoRoll();
  setupProjectControls();
  setupKeyboardShortcuts();
  AudioEngine.init();
  syncAudioState();

  AudioEngine.setOnStepChange(step => {
    State.currentStep = step;
    updateSequencerPlayhead(step);
    updatePianoRollPlayhead(step);
  });

  // Animate BPM display
  $('bpm-display').addEventListener('click', () => {
    const val = prompt('Set BPM (40-200):', State.bpm);
    if (val) {
      const n = parseInt(val);
      if (n >= 40 && n <= 200) {
        State.bpm = n;
        $('bpm-display').textContent = n;
        AudioEngine.setBpm(n);
      }
    }
  });

  $('bpm-up').addEventListener('click', () => {
    if (State.bpm < 200) { State.bpm++; $('bpm-display').textContent = State.bpm; AudioEngine.setBpm(State.bpm); }
  });
  $('bpm-down').addEventListener('click', () => {
    if (State.bpm > 40) { State.bpm--; $('bpm-display').textContent = State.bpm; AudioEngine.setBpm(State.bpm); }
  });

  $('master-vol').addEventListener('input', e => {
    State.masterVol = parseFloat(e.target.value);
    AudioEngine.setMasterVol(State.masterVol);
    $('master-vol-val').textContent = Math.round(State.masterVol * 100) + '%';
  });
});

// ─── AUTH ──────────────────────────────────────────────────
function checkAuth() {
  const guestMode = sessionStorage.getItem('guestMode');
  if (guestMode === 'true') {
    State.guestMode = true;
    $('user-name').textContent = 'Guest';
    $('btn-save').style.opacity = '0.4';
    $('btn-save').title = 'Sign in to save';
    return;
  }

  if (typeof firebase !== 'undefined') {
    auth.onAuthStateChanged(user => {
      if (user) {
        State.user = user;
        $('user-name').textContent = user.displayName || user.email;
        if (user.photoURL) {
          $('user-avatar').src = user.photoURL;
          $('user-avatar').style.display = 'block';
        }
        loadProjects();
      } else {
        window.location.href = 'index.html';
      }
    });
  } else {
    // Firebase not configured - run in demo mode
    State.guestMode = true;
    $('user-name').textContent = 'Demo';
  }
}

function signOut() {
  if (auth) {
    auth.signOut().then(() => { window.location.href = 'index.html'; });
  }
}

// ─── TRANSPORT ─────────────────────────────────────────────
function setupTransport() {
  $('btn-play').addEventListener('click', togglePlay);
  $('btn-stop').addEventListener('click', stopPlayback);
  $('btn-rewind').addEventListener('click', () => { stopPlayback(); });
}

function togglePlay() {
  if (State.isPlaying) {
    stopPlayback();
  } else {
    startPlayback();
  }
}

function startPlayback() {
  State.isPlaying = true;
  $('btn-play').innerHTML = `<span class="icon">⏸</span>`;
  $('btn-play').classList.add('active');
  syncAudioState();
  AudioEngine.play();
}

function stopPlayback() {
  State.isPlaying = false;
  State.currentStep = -1;
  $('btn-play').innerHTML = `<span class="icon">▶</span>`;
  $('btn-play').classList.remove('active');
  AudioEngine.stop();
  updateSequencerPlayhead(-1);
  updatePianoRollPlayhead(-1);
}

function syncAudioState() {
  const pattern = State.sequencer.patterns[State.sequencer.activePattern];
  AudioEngine.setSequencerData(pattern);
  AudioEngine.setPianoRollNotes(State.pianoRoll.notes);
  AudioEngine.setPianoRollLoop(State.pianoRoll.loopBeats);
  AudioEngine.setSynthSettings(State.synth);
  AudioEngine.setBpm(State.bpm);

  State.mixer.channels.forEach((ch, i) => {
    AudioEngine.setChannelVol(i, ch.muted ? 0 : ch.volume);
    AudioEngine.setChannelPan(i, ch.pan);
  });

  AudioEngine.setReverbWet(State.fx.reverb.wet);
  AudioEngine.setDelayWet(State.fx.delay.wet);
  AudioEngine.setDelayTime(State.fx.delay.time);
  AudioEngine.setDelayFeedback(State.fx.delay.feedback);
  AudioEngine.setDistortionWet(State.fx.distortion.wet);
  AudioEngine.setDistortionDrive(State.fx.distortion.drive);
}

// ─── TABS ──────────────────────────────────────────────────
function setupTabs() {
  $$('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      switchTab(tab);
    });
  });
}

function switchTab(tab) {
  State.currentTab = tab;
  $$('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  $$('.tab-panel').forEach(p => p.classList.toggle('active', p.id === `tab-${tab}`));
}

// ─── STEP SEQUENCER ────────────────────────────────────────
function renderSequencer() {
  const pattern = State.sequencer.patterns[State.sequencer.activePattern];
  const grid = $('seq-grid');
  grid.innerHTML = '';

  pattern.channels.forEach((ch, chIdx) => {
    const row = document.createElement('div');
    row.className = 'seq-row';
    row.dataset.ch = chIdx;

    // Channel controls
    const controls = document.createElement('div');
    controls.className = 'seq-controls';
    controls.innerHTML = `
      <span class="ch-name" title="${ch.name}">${ch.name}</span>
      <button class="ch-mute ${ch.muted ? 'active' : ''}" data-ch="${chIdx}" title="Mute">M</button>
      <button class="ch-solo ${ch.solo ? 'active' : ''}" data-ch="${chIdx}" title="Solo">S</button>
      <input type="range" class="ch-vol" min="0" max="1" step="0.01" value="${ch.volume}" data-ch="${chIdx}" title="Volume">
    `;
    row.appendChild(controls);

    // Steps container
    const stepsDiv = document.createElement('div');
    stepsDiv.className = 'seq-steps';

    ch.steps.forEach((active, stepIdx) => {
      const btn = document.createElement('button');
      btn.className = `step-btn ${active ? 'on' : ''} ${stepIdx % 4 === 0 ? 'beat-start' : ''}`;
      btn.dataset.ch = chIdx;
      btn.dataset.step = stepIdx;
      if (stepIdx === State.currentStep) btn.classList.add('playing');
      btn.addEventListener('click', () => toggleStep(chIdx, stepIdx));
      btn.addEventListener('contextmenu', e => {
        e.preventDefault();
        // Right click to set velocity (future)
      });
      stepsDiv.appendChild(btn);
    });

    row.appendChild(stepsDiv);
    grid.appendChild(row);
  });

  // Mute/solo listeners
  $$('.ch-mute').forEach(btn => {
    btn.addEventListener('click', () => {
      const ch = parseInt(btn.dataset.ch);
      State.sequencer.patterns[State.sequencer.activePattern].channels[ch].muted ^= true;
      btn.classList.toggle('active');
      syncAudioState();
    });
  });

  $$('.ch-solo').forEach(btn => {
    btn.addEventListener('click', () => {
      const ch = parseInt(btn.dataset.ch);
      const channels = State.sequencer.patterns[State.sequencer.activePattern].channels;
      const wasSolo = channels[ch].solo;
      channels.forEach(c => c.solo = false);
      channels[ch].solo = !wasSolo;
      renderSequencer();
      syncAudioState();
    });
  });

  $$('.ch-vol').forEach(input => {
    input.addEventListener('input', () => {
      const ch = parseInt(input.dataset.ch);
      const vol = parseFloat(input.value);
      State.sequencer.patterns[State.sequencer.activePattern].channels[ch].volume = vol;
      syncAudioState();
    });
  });

  // Pattern buttons
  renderPatternButtons();
  setupSequencerToolbar();
}

function toggleStep(ch, step) {
  const pattern = State.sequencer.patterns[State.sequencer.activePattern];
  pattern.channels[ch].steps[step] = !pattern.channels[ch].steps[step];
  const btn = document.querySelector(`.step-btn[data-ch="${ch}"][data-step="${step}"]`);
  if (btn) btn.classList.toggle('on');
  syncAudioState();
}

function updateSequencerPlayhead(step) {
  $$('.step-btn.playing').forEach(b => b.classList.remove('playing'));
  if (step >= 0) {
    $$(`.step-btn[data-step="${step}"]`).forEach(b => b.classList.add('playing'));
  }
}

function renderPatternButtons() {
  const container = $('pattern-btns');
  if (!container) return;
  container.innerHTML = '';
  State.sequencer.patterns.forEach((p, i) => {
    const btn = document.createElement('button');
    btn.className = `pat-btn ${i === State.sequencer.activePattern ? 'active' : ''}`;
    btn.textContent = `PAT ${i + 1}`;
    btn.addEventListener('click', () => {
      State.sequencer.activePattern = i;
      renderSequencer();
      syncAudioState();
    });
    container.appendChild(btn);
  });
}

function setupSequencerToolbar() {
  const clearBtn = $('btn-clear-seq');
  if (clearBtn) {
    clearBtn.onclick = () => {
      const p = State.sequencer.patterns[State.sequencer.activePattern];
      p.channels.forEach(ch => ch.steps.fill(false));
      renderSequencer();
      syncAudioState();
    };
  }

  const addPatBtn = $('btn-add-pattern');
  if (addPatBtn && State.sequencer.patterns.length < 8) {
    addPatBtn.onclick = () => {
      if (State.sequencer.patterns.length < 8) {
        const np = createEmptyPattern();
        np.name = `Pattern ${State.sequencer.patterns.length + 1}`;
        State.sequencer.patterns.push(np);
        State.sequencer.activePattern = State.sequencer.patterns.length - 1;
        renderSequencer();
        syncAudioState();
      }
    };
  }

  const stepsSelect = $('steps-select');
  if (stepsSelect) {
    stepsSelect.value = State.sequencer.patterns[State.sequencer.activePattern].channels[0].steps.length;
    stepsSelect.onchange = () => {
      const n = parseInt(stepsSelect.value);
      const p = State.sequencer.patterns[State.sequencer.activePattern];
      p.channels.forEach(ch => {
        while (ch.steps.length < n) ch.steps.push(false);
        ch.steps = ch.steps.slice(0, n);
      });
      AudioEngine.setStepCount(n);
      renderSequencer();
      syncAudioState();
    };
  }
}

// ─── PIANO ROLL ────────────────────────────────────────────
const PIANO_KEY_WIDTH = 56;
const NOTE_HEIGHT = 16;
const CELL_WIDTH = 38;
const TOTAL_NOTES = 60; // C2-B6
const BASE_MIDI = 36;   // C2

let pianoCanvas, pianoCtx;
let prDragging = false;
let prDragNote = null;
let prDragMode = null; // 'draw' | 'erase' | 'resize'
let prMouseStart = null;
let prLoopBeats = 8;
let prScrollX = 0;
let prScrollY = TOTAL_NOTES * NOTE_HEIGHT / 2 - 200;

function setupPianoRoll() {
  pianoCanvas = $('piano-roll-canvas');
  if (!pianoCanvas) return;
  pianoCtx = pianoCanvas.getContext('2d');
  resizePianoRoll();
  drawPianoRoll();

  pianoCanvas.addEventListener('mousedown', prMouseDown);
  pianoCanvas.addEventListener('mousemove', prMouseMove);
  pianoCanvas.addEventListener('mouseup', prMouseUp);
  pianoCanvas.addEventListener('contextmenu', e => { e.preventDefault(); });
  pianoCanvas.addEventListener('wheel', prWheel, { passive: true });

  window.addEventListener('resize', () => { resizePianoRoll(); drawPianoRoll(); });

  // Loop length
  const loopSelect = $('pr-loop');
  if (loopSelect) {
    loopSelect.value = State.pianoRoll.loopBeats;
    loopSelect.addEventListener('change', () => {
      State.pianoRoll.loopBeats = parseInt(loopSelect.value);
      syncAudioState();
      drawPianoRoll();
    });
  }

  $('pr-clear')?.addEventListener('click', () => {
    State.pianoRoll.notes = [];
    syncAudioState();
    drawPianoRoll();
  });

  $('pr-zoom-in')?.addEventListener('click', () => {
    State.pianoRoll.zoomX = Math.min(4, State.pianoRoll.zoomX * 1.25);
    drawPianoRoll();
  });

  $('pr-zoom-out')?.addEventListener('click', () => {
    State.pianoRoll.zoomX = Math.max(0.25, State.pianoRoll.zoomX * 0.8);
    drawPianoRoll();
  });
}

function resizePianoRoll() {
  if (!pianoCanvas) return;
  const container = pianoCanvas.parentElement;
  pianoCanvas.width = container.offsetWidth;
  pianoCanvas.height = container.offsetHeight;
}

function prGetCellWidth() {
  return CELL_WIDTH * State.pianoRoll.zoomX;
}

function prXToBeat(x) {
  return (x - PIANO_KEY_WIDTH + prScrollX) / prGetCellWidth();
}

function prYToMidi(y) {
  const noteIndex = Math.floor((y + prScrollY) / NOTE_HEIGHT);
  return BASE_MIDI + (TOTAL_NOTES - 1 - noteIndex);
}

function prBeatToX(beat) {
  return beat * prGetCellWidth() - prScrollX + PIANO_KEY_WIDTH;
}

function prMidiToY(midi) {
  return (TOTAL_NOTES - 1 - (midi - BASE_MIDI)) * NOTE_HEIGHT - prScrollY;
}

function prMouseDown(e) {
  const rect = pianoCanvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;

  // Piano key area
  if (mx < PIANO_KEY_WIDTH) {
    const midi = prYToMidi(my);
    if (midi >= BASE_MIDI && midi < BASE_MIDI + TOTAL_NOTES) {
      AudioEngine.init();
      AudioEngine.triggerNote && AudioEngine.triggerNote(midi, AudioEngine.ctx?.currentTime || 0, 0.5);
    }
    return;
  }

  const beat = prXToBeat(mx);
  const midi = prYToMidi(my);
  if (midi < BASE_MIDI || midi >= BASE_MIDI + TOTAL_NOTES) return;
  if (beat < 0 || beat >= State.pianoRoll.loopBeats) return;

  // Snap to grid
  const snapBeat = Math.floor(beat * 4) / 4;

  if (e.button === 2 || e.ctrlKey) {
    // Erase
    prDragMode = 'erase';
    eraseNoteAt(snapBeat, midi);
  } else {
    // Check if clicking existing note
    const existing = State.pianoRoll.notes.find(n =>
      n.midiNote === midi &&
      snapBeat >= n.startBeat &&
      snapBeat < n.startBeat + n.duration
    );
    if (existing) {
      prDragMode = 'erase';
      State.pianoRoll.notes = State.pianoRoll.notes.filter(n => n !== existing);
    } else {
      prDragMode = 'draw';
      prDragNote = { midiNote: midi, startBeat: snapBeat, duration: 0.25 };
      State.pianoRoll.notes.push(prDragNote);
    }
    prDragging = true;
    prMouseStart = { x: mx, beat: snapBeat, midi };
  }

  syncAudioState();
  drawPianoRoll();
}

function prMouseMove(e) {
  if (!prDragging || prDragMode !== 'draw' || !prDragNote) return;
  const rect = pianoCanvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const beat = prXToBeat(mx);
  const snapEnd = Math.ceil(beat * 4) / 4;
  const dur = Math.max(0.25, snapEnd - prDragNote.startBeat);
  prDragNote.duration = dur;
  syncAudioState();
  drawPianoRoll();
}

function prMouseUp() {
  prDragging = false;
  prDragNote = null;
  prDragMode = null;
}

function prWheel(e) {
  if (e.shiftKey) {
    prScrollX = Math.max(0, prScrollX + e.deltaY * 0.5);
  } else {
    prScrollY = Math.max(0, Math.min(
      TOTAL_NOTES * NOTE_HEIGHT - pianoCanvas.height + 40,
      prScrollY + e.deltaY * 0.5
    ));
  }
  drawPianoRoll();
}

function eraseNoteAt(beat, midi) {
  State.pianoRoll.notes = State.pianoRoll.notes.filter(n =>
    !(n.midiNote === midi && beat >= n.startBeat && beat < n.startBeat + n.duration)
  );
  syncAudioState();
  drawPianoRoll();
}

const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const BLACK_KEYS = new Set([1,3,6,8,10]);

function drawPianoRoll() {
  if (!pianoCtx) return;
  const W = pianoCanvas.width;
  const H = pianoCanvas.height;
  const cw = prGetCellWidth();
  const loopBeats = State.pianoRoll.loopBeats;

  pianoCtx.clearRect(0, 0, W, H);

  // Background
  pianoCtx.fillStyle = '#0e0e1a';
  pianoCtx.fillRect(0, 0, W, H);

  // Draw rows
  for (let i = 0; i < TOTAL_NOTES; i++) {
    const midi = BASE_MIDI + (TOTAL_NOTES - 1 - i);
    const noteNum = midi % 12;
    const y = i * NOTE_HEIGHT - prScrollY;
    if (y + NOTE_HEIGHT < 0 || y > H) continue;

    const isBlack = BLACK_KEYS.has(noteNum);
    pianoCtx.fillStyle = isBlack ? '#111120' : '#161628';
    pianoCtx.fillRect(PIANO_KEY_WIDTH, y, W - PIANO_KEY_WIDTH, NOTE_HEIGHT);

    // Row separator
    pianoCtx.fillStyle = 'rgba(255,255,255,0.04)';
    pianoCtx.fillRect(PIANO_KEY_WIDTH, y + NOTE_HEIGHT - 1, W - PIANO_KEY_WIDTH, 1);

    // C line accent
    if (noteNum === 0) {
      pianoCtx.fillStyle = 'rgba(0,229,255,0.15)';
      pianoCtx.fillRect(PIANO_KEY_WIDTH, y, W - PIANO_KEY_WIDTH, 1);
    }

    // Piano key
    const keyW = PIANO_KEY_WIDTH - 2;
    if (isBlack) {
      pianoCtx.fillStyle = '#1a1a2e';
      pianoCtx.fillRect(2, y + 1, keyW * 0.65, NOTE_HEIGHT - 2);
    } else {
      pianoCtx.fillStyle = '#2a2a3e';
      pianoCtx.fillRect(2, y + 1, keyW, NOTE_HEIGHT - 2);
      if (noteNum === 0) {
        pianoCtx.fillStyle = '#00e5ff';
        pianoCtx.font = '9px monospace';
        pianoCtx.textBaseline = 'middle';
        pianoCtx.fillText(`C${Math.floor(midi / 12) - 1}`, keyW - 22, y + NOTE_HEIGHT / 2);
      }
    }
  }

  // Vertical grid lines (beats)
  for (let b = 0; b <= loopBeats * 4; b++) {
    const x = prBeatToX(b / 4);
    if (x < PIANO_KEY_WIDTH || x > W) continue;
    const isBeat = b % 4 === 0;
    const isBar = b % 16 === 0;
    pianoCtx.fillStyle = isBar
      ? 'rgba(0,229,255,0.25)'
      : isBeat
      ? 'rgba(255,255,255,0.12)'
      : 'rgba(255,255,255,0.04)';
    pianoCtx.fillRect(x, 0, 1, H);

    // Beat labels
    if (isBeat) {
      pianoCtx.fillStyle = 'rgba(0,229,255,0.6)';
      pianoCtx.font = '9px monospace';
      pianoCtx.textBaseline = 'top';
      pianoCtx.fillText(`${b / 4 + 1}`, x + 2, 2);
    }
  }

  // Loop region overlay
  const loopEndX = prBeatToX(loopBeats);
  if (loopEndX < W) {
    pianoCtx.fillStyle = 'rgba(0,0,0,0.35)';
    pianoCtx.fillRect(loopEndX, 0, W - loopEndX, H);
    pianoCtx.fillStyle = 'rgba(0,229,255,0.5)';
    pianoCtx.fillRect(loopEndX - 1, 0, 2, H);
  }

  // Draw notes
  State.pianoRoll.notes.forEach(note => {
    const x = prBeatToX(note.startBeat);
    const y = (TOTAL_NOTES - 1 - (note.midiNote - BASE_MIDI)) * NOTE_HEIGHT - prScrollY;
    const w = Math.max(4, note.duration * cw - 2);
    if (x + w < PIANO_KEY_WIDTH || x > W || y + NOTE_HEIGHT < 0 || y > H) return;

    const grad = pianoCtx.createLinearGradient(x, y, x, y + NOTE_HEIGHT);
    grad.addColorStop(0, '#00e5ff');
    grad.addColorStop(1, '#0090aa');
    pianoCtx.fillStyle = grad;
    pianoCtx.beginPath();
    pianoCtx.roundRect(Math.max(x, PIANO_KEY_WIDTH + 1), y + 1, w, NOTE_HEIGHT - 2, 3);
    pianoCtx.fill();

    // Note label
    if (w > 20) {
      const noteNum = note.midiNote % 12;
      pianoCtx.fillStyle = '#003040';
      pianoCtx.font = 'bold 9px monospace';
      pianoCtx.textBaseline = 'middle';
      pianoCtx.fillText(NOTE_NAMES[noteNum], Math.max(x, PIANO_KEY_WIDTH) + 3, y + NOTE_HEIGHT / 2);
    }
  });

  // Playhead
  if (State.currentStep >= 0) {
    const stepBeat = State.currentStep / 4;
    const playX = prBeatToX(stepBeat);
    if (playX >= PIANO_KEY_WIDTH && playX <= W) {
      pianoCtx.fillStyle = 'rgba(255, 100, 50, 0.8)';
      pianoCtx.fillRect(playX - 1, 0, 2, H);
    }
  }

  // Piano key separator
  pianoCtx.fillStyle = 'rgba(0,229,255,0.3)';
  pianoCtx.fillRect(PIANO_KEY_WIDTH - 1, 0, 1, H);
}

function updatePianoRollPlayhead(step) {
  if (State.currentTab === 'pianoroll') drawPianoRoll();
}

// ─── SYNTH ─────────────────────────────────────────────────
function renderSynth() {
  const s = State.synth;

  // Oscillator types
  ['osc1', 'osc2'].forEach(oscId => {
    const key = oscId === 'osc1' ? 'osc1Type' : 'osc2Type';
    $$(`#${oscId}-type button`).forEach(btn => {
      btn.classList.toggle('active', btn.dataset.wave === s[key]);
      btn.addEventListener('click', () => {
        s[key] = btn.dataset.wave;
        $$(`#${oscId}-type button`).forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        AudioEngine.setSynthSettings(s);
      });
    });
  });

  // Knobs
  const knobs = [
    ['synth-osc2-detune', 'osc2Detune', -50, 50, 1],
    ['synth-osc1-vol', 'osc1Vol', 0, 1, 0.01],
    ['synth-osc2-vol', 'osc2Vol', 0, 1, 0.01],
    ['synth-cutoff', 'filterCutoff', 100, 15000, 10],
    ['synth-res', 'filterRes', 0.1, 25, 0.1],
    ['synth-attack', 'attack', 0.001, 2, 0.001],
    ['synth-decay', 'decay', 0.001, 2, 0.001],
    ['synth-sustain', 'sustain', 0, 1, 0.01],
    ['synth-release', 'release', 0.01, 4, 0.01],
  ];

  knobs.forEach(([id, key, min, max, step]) => {
    const el = $(id);
    if (!el) return;
    el.min = min; el.max = max; el.step = step; el.value = s[key];
    el.addEventListener('input', () => {
      s[key] = parseFloat(el.value);
      const disp = $(`${id}-val`);
      if (disp) disp.textContent = formatKnobVal(key, s[key]);
      AudioEngine.setSynthSettings(s);
    });
    const disp = $(`${id}-val`);
    if (disp) disp.textContent = formatKnobVal(key, s[key]);
  });

  // Filter type
  $$('#filter-type button').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.ftype === s.filterType);
    btn.addEventListener('click', () => {
      s.filterType = btn.dataset.ftype;
      $$('#filter-type button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      AudioEngine.setSynthSettings(s);
    });
  });
}

function formatKnobVal(key, v) {
  if (key === 'filterCutoff') return `${Math.round(v)}Hz`;
  if (key === 'filterRes') return v.toFixed(1);
  if (key === 'osc2Detune') return `${Math.round(v)}ct`;
  if (['attack','decay','release'].includes(key)) return `${v.toFixed(3)}s`;
  return v.toFixed(2);
}

// ─── MIXER ─────────────────────────────────────────────────
function renderMixer() {
  const grid = $('mixer-grid');
  if (!grid) return;
  grid.innerHTML = '';

  State.mixer.channels.forEach((ch, i) => {
    const strip = document.createElement('div');
    strip.className = 'mixer-strip';
    strip.innerHTML = `
      <div class="mix-name">${ch.name}</div>
      <div class="mix-vu" id="vu-${i}"><div class="vu-bar"></div></div>
      <input type="range" class="mix-fader" orient="vertical"
        min="0" max="1.5" step="0.01" value="${ch.volume}"
        data-ch="${i}" title="Volume">
      <div class="mix-vol-val">${Math.round(ch.volume * 100)}%</div>
      <div class="mix-pan-wrap">
        <input type="range" class="mix-pan" min="-1" max="1" step="0.01"
          value="${ch.pan}" data-ch="${i}" title="Pan">
      </div>
      <div class="mix-btns">
        <button class="mix-mute ${ch.muted ? 'active' : ''}" data-ch="${i}">M</button>
        <button class="mix-solo ${ch.solo ? 'active' : ''}" data-ch="${i}">S</button>
      </div>
    `;
    grid.appendChild(strip);
  });

  // Master channel
  const master = document.createElement('div');
  master.className = 'mixer-strip master-strip';
  master.innerHTML = `
    <div class="mix-name">MASTER</div>
    <div class="mix-vu" id="vu-master"><div class="vu-bar"></div></div>
    <input type="range" class="mix-fader" orient="vertical"
      min="0" max="1.2" step="0.01" value="${State.masterVol}" id="mix-master-vol" title="Master Volume">
    <div class="mix-vol-val" id="mix-master-val">${Math.round(State.masterVol * 100)}%</div>
  `;
  grid.appendChild(master);

  // Listeners
  $$('.mix-fader').forEach(el => {
    if (el.id === 'mix-master-vol') {
      el.addEventListener('input', () => {
        State.masterVol = parseFloat(el.value);
        $('mix-master-val').textContent = Math.round(State.masterVol * 100) + '%';
        $('master-vol').value = State.masterVol;
        $('master-vol-val').textContent = Math.round(State.masterVol * 100) + '%';
        AudioEngine.setMasterVol(State.masterVol);
      });
    } else {
      el.addEventListener('input', () => {
        const ch = parseInt(el.dataset.ch);
        State.mixer.channels[ch].volume = parseFloat(el.value);
        el.nextElementSibling.textContent = Math.round(parseFloat(el.value) * 100) + '%';
        syncAudioState();
      });
    }
  });

  $$('.mix-pan').forEach(el => {
    el.addEventListener('input', () => {
      const ch = parseInt(el.dataset.ch);
      State.mixer.channels[ch].pan = parseFloat(el.value);
      syncAudioState();
    });
  });

  $$('.mix-mute').forEach(btn => {
    btn.addEventListener('click', () => {
      const ch = parseInt(btn.dataset.ch);
      State.mixer.channels[ch].muted ^= true;
      btn.classList.toggle('active');
      syncAudioState();
    });
  });

  $$('.mix-solo').forEach(btn => {
    btn.addEventListener('click', () => {
      const ch = parseInt(btn.dataset.ch);
      const chs = State.mixer.channels;
      const wasSolo = chs[ch].solo;
      chs.forEach(c => c.solo = false);
      chs[ch].solo = !wasSolo;
      renderMixer();
      syncAudioState();
    });
  });
}

// ─── FX ────────────────────────────────────────────────────
function renderFX() {
  const knobs = [
    ['fx-reverb-wet', 'reverb', 'wet', 0, 1, 0.01],
    ['fx-reverb-size', 'reverb', 'size', 0.1, 1, 0.01],
    ['fx-delay-wet', 'delay', 'wet', 0, 1, 0.01],
    ['fx-delay-time', 'delay', 'time', 0.05, 2, 0.01],
    ['fx-delay-fb', 'delay', 'feedback', 0, 0.95, 0.01],
    ['fx-dist-wet', 'distortion', 'wet', 0, 1, 0.01],
    ['fx-dist-drive', 'distortion', 'drive', 0, 1, 0.01],
  ];

  knobs.forEach(([id, fx, param, min, max, step]) => {
    const el = $(id);
    if (!el) return;
    el.min = min; el.max = max; el.step = step;
    el.value = State.fx[fx][param];
    el.addEventListener('input', () => {
      State.fx[fx][param] = parseFloat(el.value);
      const disp = $(`${id}-val`);
      if (disp) disp.textContent = parseFloat(el.value).toFixed(2);
      syncFXParam(fx, param, parseFloat(el.value));
    });
    const disp = $(`${id}-val`);
    if (disp) disp.textContent = parseFloat(el.value).toFixed(2);
  });
}

function syncFXParam(fx, param, val) {
  if (fx === 'reverb') {
    if (param === 'wet') AudioEngine.setReverbWet(val);
    if (param === 'size') AudioEngine.setReverbSize(val);
  } else if (fx === 'delay') {
    if (param === 'wet') AudioEngine.setDelayWet(val);
    if (param === 'time') AudioEngine.setDelayTime(val);
    if (param === 'feedback') AudioEngine.setDelayFeedback(val);
  } else if (fx === 'distortion') {
    if (param === 'wet') AudioEngine.setDistortionWet(val);
    if (param === 'drive') AudioEngine.setDistortionDrive(val);
  }
}

// ─── PROJECT CONTROLS ──────────────────────────────────────
function setupProjectControls() {
  $('btn-new')?.addEventListener('click', newProject);
  $('btn-save')?.addEventListener('click', saveProject);
  $('btn-load')?.addEventListener('click', toggleProjectsPanel);
  $('project-name')?.addEventListener('blur', e => {
    State.projectName = e.target.textContent.trim() || 'Untitled';
  });
  $('btn-signout')?.addEventListener('click', signOut);
}

function newProject() {
  if (confirm('Start a new project? Unsaved changes will be lost.')) {
    State.sequencer.patterns = [createEmptyPattern()];
    State.sequencer.activePattern = 0;
    State.pianoRoll.notes = [];
    State.synth = { osc1Type:'sawtooth', osc2Type:'square', osc2Detune:7, osc1Vol:0.7, osc2Vol:0.3, filterType:'lowpass', filterCutoff:1800, filterRes:4, attack:0.01, decay:0.15, sustain:0.6, release:0.35 };
    State.fx = { reverb:{wet:0,size:0.5}, delay:{wet:0,time:0.375,feedback:0.35}, distortion:{wet:0,drive:0.3} };
    State.projectName = 'Untitled Project';
    State.projectId = null;
    if ($('project-name')) $('project-name').textContent = State.projectName;
    renderSequencer();
    renderMixer();
    renderFX();
    renderSynth();
    drawPianoRoll();
    syncAudioState();
  }
}

function serializeProject() {
  const pattern = State.sequencer.patterns[State.sequencer.activePattern];
  return {
    name: State.projectName,
    bpm: State.bpm,
    updatedAt: new Date().toISOString(),
    sequencer: {
      patterns: State.sequencer.patterns.map(p => ({
        name: p.name,
        channels: p.channels.map(ch => ({
          name: ch.name,
          steps: [...ch.steps],
          volume: ch.volume,
          pan: ch.pan,
          muted: ch.muted,
        })),
      })),
      activePattern: State.sequencer.activePattern,
    },
    pianoRoll: {
      notes: [...State.pianoRoll.notes],
      loopBeats: State.pianoRoll.loopBeats,
    },
    synth: { ...State.synth },
    mixer: {
      masterVol: State.masterVol,
      channels: State.mixer.channels.map(ch => ({ ...ch })),
    },
    fx: JSON.parse(JSON.stringify(State.fx)),
  };
}

function loadProjectData(data) {
  State.projectName = data.name || 'Untitled';
  State.bpm = data.bpm || 120;
  $('project-name').textContent = State.projectName;
  $('bpm-display').textContent = State.bpm;

  if (data.sequencer) {
    State.sequencer.patterns = data.sequencer.patterns.map(p => ({
      name: p.name,
      channels: p.channels.map(ch => ({
        name: ch.name,
        steps: [...ch.steps],
        volume: ch.volume,
        pan: ch.pan,
        muted: ch.muted,
        solo: false,
      })),
    }));
    State.sequencer.activePattern = data.sequencer.activePattern || 0;
  }

  if (data.pianoRoll) {
    State.pianoRoll.notes = data.pianoRoll.notes || [];
    State.pianoRoll.loopBeats = data.pianoRoll.loopBeats || 8;
    const loopSel = $('pr-loop');
    if (loopSel) loopSel.value = State.pianoRoll.loopBeats;
  }

  if (data.synth) State.synth = { ...State.synth, ...data.synth };
  if (data.mixer) {
    State.masterVol = data.mixer.masterVol || 0.85;
    State.mixer.channels = data.mixer.channels;
  }
  if (data.fx) State.fx = data.fx;

  renderSequencer();
  renderMixer();
  renderFX();
  renderSynth();
  drawPianoRoll();
  syncAudioState();
}

async function saveProject() {
  if (State.guestMode) {
    showToast('Sign in to save projects!', 'warn');
    return;
  }
  if (!State.user) return;

  const data = serializeProject();
  showToast('Saving...', 'info');

  try {
    if (State.projectId) {
      await db.collection('users').doc(State.user.uid).collection('projects').doc(State.projectId).set(data);
    } else {
      const ref = await db.collection('users').doc(State.user.uid).collection('projects').add(data);
      State.projectId = ref.id;
    }
    showToast('Project saved!', 'success');
    loadProjects();
  } catch (e) {
    showToast('Save failed: ' + e.message, 'error');
  }
}

async function loadProjects() {
  if (!State.user) return;
  try {
    const snap = await db.collection('users').doc(State.user.uid).collection('projects')
      .orderBy('updatedAt', 'desc').limit(20).get();
    State.projects = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderProjectsList();
  } catch (e) {
    console.warn('Could not load projects:', e);
  }
}

function toggleProjectsPanel() {
  const panel = $('projects-panel');
  if (!panel) return;
  panel.classList.toggle('open');
}

function renderProjectsList() {
  const list = $('projects-list');
  if (!list) return;
  if (State.projects.length === 0) {
    list.innerHTML = '<p class="no-projects">No saved projects yet.</p>';
    return;
  }
  list.innerHTML = State.projects.map(p => `
    <div class="project-item" data-id="${p.id}">
      <div class="proj-info">
        <span class="proj-name">${p.name}</span>
        <span class="proj-date">${new Date(p.updatedAt).toLocaleDateString()}</span>
      </div>
      <div class="proj-actions">
        <button class="btn-proj-load" data-id="${p.id}">Load</button>
        <button class="btn-proj-delete" data-id="${p.id}">✕</button>
      </div>
    </div>
  `).join('');

  $$('.btn-proj-load').forEach(btn => {
    btn.addEventListener('click', async () => {
      const proj = State.projects.find(p => p.id === btn.dataset.id);
      if (proj) {
        State.projectId = proj.id;
        loadProjectData(proj);
        toggleProjectsPanel();
        showToast(`Loaded: ${proj.name}`, 'success');
      }
    });
  });

  $$('.btn-proj-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this project?')) return;
      try {
        await db.collection('users').doc(State.user.uid).collection('projects').doc(btn.dataset.id).delete();
        State.projects = State.projects.filter(p => p.id !== btn.dataset.id);
        renderProjectsList();
        showToast('Project deleted', 'info');
      } catch (e) {
        showToast('Delete failed', 'error');
      }
    });
  });
}

// ─── KEYBOARD SHORTCUTS ────────────────────────────────────
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.isContentEditable) return;
    if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
    if (e.code === 'Escape') stopPlayback();
    if ((e.metaKey || e.ctrlKey) && e.code === 'KeyS') { e.preventDefault(); saveProject(); }
  });
}

// ─── TOAST NOTIFICATIONS ───────────────────────────────────
function showToast(msg, type = 'info') {
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2800);
}
