/**
 * GIF Compressor - app.js
 * Client-side GIF batch compression using gifsicle-wasm-browser
 * Uses the real gifsicle optimizer (same as command-line) compiled to WASM
 * Pure browser, no server needed — works on GitHub Pages
 */

// gifsicle-wasm-browser is loaded via <script> tag in HTML as a global
// It needs its own internal worker mechanism that doesn't work with ES module import
const gifsicleReady = import('https://cdn.jsdelivr.net/npm/gifsicle-wasm-browser@1.5.16/+esm');

// ─── State ────────────────────────────────────────────────────────────────────
const state = {
  files: [],
  isProcessing: false,
  settings: {
    optimize: 2,       // -O1, -O2, -O3
    lossy: 0,          // 0 = off, 1–200 (30-60 recommended)
    scale: 100,        // resize % 10–100
    colors: 256,       // max colors 2–256 (256 = keep original palette)
  },
};

// ─── DOM refs ────────────────────────────────────────────────────────────────
const dropZone       = document.getElementById('drop-zone');
const fileInput      = document.getElementById('file-input');
const queueList      = document.getElementById('queue-list');
const queueEmpty     = document.getElementById('queue-empty');
const queueCount     = document.getElementById('queue-count');
const btnCompress    = document.getElementById('btn-compress');
const btnDownloadAll = document.getElementById('btn-download-all');
const btnClear       = document.getElementById('btn-clear');
const overallBar     = document.getElementById('overall-progress');
const overallFill    = document.getElementById('overall-fill');
const overallLabel   = document.getElementById('overall-label');
const overallPct     = document.getElementById('overall-pct');

// Settings inputs
const optimizeSelect = document.getElementById('optimize');
const lossySlider    = document.getElementById('lossy');
const lossyVal       = document.getElementById('lossy-val');
const scaleSlider    = document.getElementById('scale');
const scaleVal       = document.getElementById('scale-val');
const colorsSlider   = document.getElementById('colors');
const colorsVal      = document.getElementById('colors-val');

// Stats
const statTotal      = document.getElementById('stat-total');
const statDone       = document.getElementById('stat-done');
const statSaved      = document.getElementById('stat-saved');
const statAvg        = document.getElementById('stat-avg');

// ─── Utility helpers ──────────────────────────────────────────────────────────
function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function reductionPct(original, compressed) {
  return Math.round((1 - compressed / original) * 100);
}

/**
 * Estimate compressed output size based on settings.
 * CONSERVATIVE estimates to avoid showing misleading predictions.
 * Real compression depends heavily on GIF content — this is a rough guide.
 */
function estimateSize(originalSize, settings) {
  let factor = 1.0;

  // Optimization level: gifsicle -O alone typically saves 2-10% on already-optimized GIFs
  if (settings.optimize === 1) factor *= 0.97;
  else if (settings.optimize === 2) factor *= 0.94;
  else if (settings.optimize === 3) factor *= 0.90;

  // Lossy compression (biggest actual impact)
  if (settings.lossy > 0) {
    // lossy=30 ~ 10-20% savings, lossy=100 ~ 30-50%
    factor *= Math.max(0.40, 1 - (settings.lossy / 200) * 0.45);
  }

  // Scale (area reduction — proportional)
  if (settings.scale < 100) {
    factor *= Math.pow(settings.scale / 100, 1.6);
  }

  // Color reduction
  if (settings.colors < 256) {
    factor *= Math.pow(settings.colors / 256, 0.3);
  }

  const estimated = originalSize * factor;
  return Math.round(Math.max(originalSize * 0.05, Math.min(originalSize * 0.99, estimated)));
}

// ─── Settings binding ─────────────────────────────────────────────────────────
function onSettingsChanged() {
  state.settings.optimize = parseInt(optimizeSelect.value);
  state.settings.lossy    = parseInt(lossySlider.value);
  state.settings.scale    = parseInt(scaleSlider.value);
  state.settings.colors   = parseInt(colorsSlider.value);

  // Update display values
  if (state.settings.lossy === 0) {
    lossyVal.textContent = 'OFF';
  } else {
    lossyVal.textContent = state.settings.lossy;
  }
  scaleVal.textContent  = state.settings.scale + '%';

  if (state.settings.colors >= 256) {
    colorsVal.textContent = 'Auto';
  } else {
    colorsVal.textContent = state.settings.colors;
  }

  updateAllEstimates();
}

optimizeSelect.addEventListener('change', onSettingsChanged);
lossySlider.addEventListener('input', onSettingsChanged);
scaleSlider.addEventListener('input', onSettingsChanged);
colorsSlider.addEventListener('input', onSettingsChanged);

// ─── Drag & Drop ──────────────────────────────────────────────────────────────
['dragenter', 'dragover'].forEach(evt =>
  dropZone.addEventListener(evt, e => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  })
);

['dragleave', 'drop'].forEach(evt =>
  dropZone.addEventListener(evt, e => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
  })
);

dropZone.addEventListener('drop', e => {
  const files = [...e.dataTransfer.files].filter(f => f.type === 'image/gif');
  if (files.length) addFiles(files);
  else showToast('Solo se aceptan archivos .GIF', 'warning');
});

dropZone.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', () => {
  const files = [...fileInput.files].filter(f => f.type === 'image/gif');
  if (files.length) addFiles(files);
  fileInput.value = '';
});

// ─── File management ──────────────────────────────────────────────────────────
function addFiles(files) {
  files.forEach(file => {
    const id = uid();
    const item = {
      id,
      file,
      name: file.name,
      originalSize: file.size,
      status: 'pending',
      blob: null,
      url: null,
      outputSize: null,
      width: 0,
      height: 0,
    };
    state.files.push(item);
    renderQueueItem(item);
  });
  updateUI();
}

function removeFile(id) {
  const idx = state.files.findIndex(f => f.id === id);
  if (idx !== -1) {
    const item = state.files[idx];
    if (item.url) URL.revokeObjectURL(item.url);
    state.files.splice(idx, 1);
    document.getElementById(`item-${id}`)?.remove();
    updateUI();
  }
}

function clearAll() {
  state.files.forEach(f => { if (f.url) URL.revokeObjectURL(f.url); });
  state.files = [];
  queueList.innerHTML = '';
  updateUI();
}

// ─── Estimated size display ───────────────────────────────────────────────────
function updateAllEstimates() {
  state.files.forEach(item => {
    if (item.status !== 'pending' && item.status !== 'error') return;
    const estEl = document.getElementById(`est-${item.id}`);
    if (!estEl) return;
    const est = estimateSize(item.originalSize, state.settings);
    const pct = reductionPct(item.originalSize, est);
    
    let dimStr = '';
    if (item.width && item.height) {
      const scale = state.settings.scale / 100;
      const newW = Math.round(item.width * scale);
      const newH = Math.round(item.height * scale);
      const colorsStr = state.settings.colors < 256 ? `, ${state.settings.colors} colores` : '';
      if (scale < 1 || state.settings.colors < 256) {
        dimStr = ` <span style="margin-left:8px;color:var(--text-secondary)">(${item.width}×${item.height}px → ${newW}×${newH}px${colorsStr})</span>`;
      } else {
        dimStr = ` <span style="margin-left:8px;color:var(--text-secondary)">(${item.width}×${item.height}px)</span>`;
      }
    }
    
    estEl.innerHTML = `≈ ${formatBytes(est)} <span class="est-reduction">(−${pct}%)</span>${dimStr}`;
    estEl.style.display = 'flex';
  });
}

// ─── Render queue item ────────────────────────────────────────────────────────
function renderQueueItem(item) {
  const est = estimateSize(item.originalSize, state.settings);
  const estPct = reductionPct(item.originalSize, est);

  const el = document.createElement('div');
  el.className = 'gif-item';
  el.id = `item-${item.id}`;
  el.innerHTML = `
    <img class="gif-thumb" id="thumb-${item.id}" src="" alt="${item.name}" />
    <div class="gif-info">
      <div class="gif-name" title="${item.name}">${item.name}</div>
      <div class="gif-sizes">
        <span class="size-original">${formatBytes(item.originalSize)}</span>
        <span class="size-arrow" id="arrow-${item.id}" style="display:none">→</span>
        <span class="size-compressed" id="size-out-${item.id}" style="display:none"></span>
        <span class="size-reduction" id="reduction-${item.id}" style="display:none"></span>
      </div>
      <div class="gif-estimate" id="est-${item.id}">
        ≈ ${formatBytes(est)} <span class="est-reduction">(−${estPct}%)</span>
      </div>
      <div class="gif-progress">
        <div class="gif-progress-bar" id="bar-${item.id}"></div>
      </div>
      <span class="gif-status-badge badge-pending" id="badge-${item.id}">⏳ Pendiente</span>
    </div>
    <div class="gif-actions">
      <button class="btn-icon btn-download" id="dl-${item.id}" title="Descargar" style="display:none">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
      </button>
      <button class="btn-icon btn-remove" id="rm-${item.id}" title="Eliminar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
          <path d="M10 11v6M14 11v6"/>
        </svg>
      </button>
    </div>`;

  queueList.appendChild(el);

  // Load thumbnail and extract dimensions
  const reader = new FileReader();
  reader.onload = e => {
    const src = e.target.result;
    document.getElementById(`thumb-${item.id}`).src = src;
    
    const img = new Image();
    img.onload = () => {
      item.width = img.width;
      item.height = img.height;
      updateAllEstimates();
    };
    img.src = src;
  };
  reader.readAsDataURL(item.file);

  // Buttons
  document.getElementById(`rm-${item.id}`).addEventListener('click', () => removeFile(item.id));
  document.getElementById(`dl-${item.id}`).addEventListener('click', () => downloadSingle(item));
}

function updateItemStatus(item) {
  const el = document.getElementById(`item-${item.id}`);
  if (!el) return;
  el.className = `gif-item status-${item.status}`;

  const badge   = document.getElementById(`badge-${item.id}`);
  const bar     = document.getElementById(`bar-${item.id}`);
  const dlBtn   = document.getElementById(`dl-${item.id}`);
  const arrow   = document.getElementById(`arrow-${item.id}`);
  const sizeOut = document.getElementById(`size-out-${item.id}`);
  const redEl   = document.getElementById(`reduction-${item.id}`);
  const estEl   = document.getElementById(`est-${item.id}`);

  if (item.status === 'processing') {
    badge.className = 'gif-status-badge badge-processing';
    badge.innerHTML = `<span class="spinner"></span> Optimizando…`;
    bar.className = 'gif-progress-bar';
    bar.style.width = '60%';
    if (estEl) estEl.style.display = 'none';
  } else if (item.status === 'done') {
    badge.className = 'gif-status-badge badge-done';
    badge.innerHTML = `✓ Listo`;
    bar.className = 'gif-progress-bar done';
    bar.style.width = '100%';
    dlBtn.style.display = 'flex';
    if (estEl) estEl.style.display = 'none';

    const pct = reductionPct(item.originalSize, item.outputSize);
    arrow.style.display = 'inline';
    sizeOut.style.display = 'inline';
    sizeOut.textContent = formatBytes(item.outputSize);
    if (pct > 0) {
      redEl.style.display = 'inline';
      redEl.textContent = `−${pct}%`;
      redEl.style.background = 'rgba(52,211,153,0.12)';
      redEl.style.color = '#34d399';
    } else {
      redEl.style.display = 'inline';
      redEl.textContent = `+${Math.abs(pct)}%`;
      redEl.style.background = 'rgba(248,113,113,0.12)';
      redEl.style.color = '#f87171';
    }
  } else if (item.status === 'error') {
    badge.className = 'gif-status-badge badge-error';
    badge.innerHTML = `✕ Error`;
    bar.className = 'gif-progress-bar error';
    bar.style.width = '100%';
    if (estEl) estEl.style.display = 'none';
  }
}

// ─── Update UI state ──────────────────────────────────────────────────────────
function updateUI() {
  const total = state.files.length;
  const done  = state.files.filter(f => f.status === 'done').length;

  queueCount.textContent = total;
  queueEmpty.style.display = total === 0 ? 'block' : 'none';

  btnCompress.disabled    = total === 0 || state.isProcessing;
  btnDownloadAll.disabled = done === 0;
  btnClear.disabled       = total === 0 || state.isProcessing;

  updateStats();
}

function updateStats() {
  const total = state.files.length;
  const done  = state.files.filter(f => f.status === 'done');

  statTotal.textContent = total;
  statDone.textContent  = done.length;

  if (done.length > 0) {
    const totalSaved = done.reduce((acc, f) => acc + (f.originalSize - f.outputSize), 0);
    const avgReduction = Math.round(
      done.reduce((acc, f) => acc + reductionPct(f.originalSize, f.outputSize), 0) / done.length
    );
    statSaved.textContent = formatBytes(Math.max(0, totalSaved));
    statAvg.textContent   = avgReduction + '%';
  } else {
    statSaved.textContent = '–';
    statAvg.textContent   = '–';
  }
}

// ─── Compression engine (gifsicle WASM) ───────────────────────────────────────
btnCompress.addEventListener('click', () => compressAll());
btnClear.addEventListener('click', () => clearAll());
btnDownloadAll.addEventListener('click', () => downloadAll());

async function compressAll() {
  const pending = state.files.filter(f => f.status === 'pending' || f.status === 'error');
  if (!pending.length) return;

  state.isProcessing = true;
  updateUI();
  overallBar.classList.add('visible');

  for (let i = 0; i < pending.length; i++) {
    const item = pending[i];
    item.status = 'processing';
    updateItemStatus(item);

    overallFill.style.width = ((i / pending.length) * 100) + '%';
    overallLabel.textContent = `Optimizando ${i + 1} / ${pending.length}…`;
    overallPct.textContent   = `${Math.round((i / pending.length) * 100)}%`;

    try {
      const result = await compressGif(item.file, state.settings);
      item.blob       = result;
      item.url        = URL.createObjectURL(result);
      item.outputSize = result.size;
      item.status     = 'done';

      // Update thumbnail to compressed preview
      const thumb = document.getElementById(`thumb-${item.id}`);
      if (thumb) thumb.src = item.url;
    } catch (err) {
      console.error('Compression error:', err);
      item.status = 'error';
    }

    updateItemStatus(item);
    updateStats();
  }

  overallFill.style.width = '100%';
  overallLabel.textContent = `¡Completado! ${pending.length} GIF(s) procesados.`;
  overallPct.textContent   = '100%';

  state.isProcessing = false;
  updateUI();
}

/**
 * Compress a single GIF using gifsicle WASM.
 * This runs the real gifsicle binary compiled to WebAssembly —
 * same tool used by professional workflows, preserving quality.
 */
async function compressGif(file, settings) {
  // Wait for gifsicle module to load
  const gifsicleModule = await gifsicleReady;
  const gifsicle = gifsicleModule.default || gifsicleModule;

  // Convert File to ArrayBuffer for gifsicle WASM virtual filesystem
  // The raw WASM module cannot read File/Blob directly
  const arrayBuffer = await file.arrayBuffer();

  // Build gifsicle command as a single string
  // CRITICAL: The library's `command` array treats each element as a SEPARATE
  // full command line to execute sequentially. We must join all arguments into
  // ONE string, otherwise it runs e.g. "-O2" alone (no file → stdin → "Is a terminal").
  const parts = [];

  // Only unoptimize (-U) when we're actually transforming the GIF (scale/colors).
  // For pure optimization runs, -U expands frames and often makes the file LARGER.
  const needsTransform = settings.scale < 100 || settings.colors < 256;
  if (needsTransform) {
    parts.push('-U');
  }

  // Optimization level (-O1, -O2, -O3)
  parts.push(`-O${settings.optimize}`);

  // Lossy compression (adds noise to compress better)
  if (settings.lossy > 0) {
    parts.push(`--lossy=${settings.lossy}`);
  }

  // Resize
  if (settings.scale < 100) {
    const pct = settings.scale / 100;
    parts.push(`--scale=${pct}`);
  }

  // Color reduction
  if (settings.colors < 256) {
    parts.push(`--colors=${settings.colors}`);
    // Dithering adds high-frequency noise which DESTROYS GIF (LZW) compression.
    parts.push('--dither=none');
  }

  // Input file and output — MUST output to /out/ directory
  parts.push('input.gif');
  parts.push('-o');
  parts.push('/out/output.gif');

  const commandStr = parts.join(' ');
  console.log('gifsicle command:', commandStr);
  console.log('Input size:', formatBytes(arrayBuffer.byteLength));

  // Run gifsicle WASM — library accepts: Url, Blob, File, ArrayBuffer (NOT Uint8Array)
  // command MUST be an array of complete command-line strings (one string = one execution)
  const output = await gifsicle.run({
    input: [{
      file: arrayBuffer,
      name: 'input.gif',
    }],
    command: [commandStr],
  });

  if (!output || output.length === 0) {
    throw new Error('gifsicle produced no output');
  }

  // Convert output to Blob — gifsicle returns File objects
  const result = output[0];
  console.log('Output result type:', result?.constructor?.name, 'size:', result?.size || result?.file?.byteLength || 'unknown');
  
  if (result instanceof Blob || result instanceof File) {
    return result;
  }
  if (result.file) {
    return new Blob([result.file], { type: 'image/gif' });
  }
  return new Blob([result], { type: 'image/gif' });
}

// ─── Download ─────────────────────────────────────────────────────────────────
function downloadSingle(item) {
  if (!item.url) return;
  const a = document.createElement('a');
  a.href     = item.url;
  a.download = item.name.replace(/\.gif$/i, '_compressed.gif');
  a.click();
}

async function downloadAll() {
  const done = state.files.filter(f => f.status === 'done');
  if (!done.length) return;

  if (done.length === 1) {
    downloadSingle(done[0]);
    return;
  }

  const zip = new JSZip();
  done.forEach(item => {
    zip.file(item.name.replace(/\.gif$/i, '_compressed.gif'), item.blob);
  });

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'gifs_comprimidos.zip';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// ─── Toast notifications ──────────────────────────────────────────────────────
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.style.cssText = `
    position:fixed; bottom:28px; left:50%; transform:translateX(-50%) translateY(20px);
    background:${type === 'warning' ? 'rgba(251,191,36,0.15)' : 'rgba(79,195,247,0.12)'};
    border:1px solid ${type === 'warning' ? 'rgba(251,191,36,0.3)' : 'rgba(79,195,247,0.3)'};
    color:${type === 'warning' ? '#fbbf24' : '#4fc3f7'};
    padding:10px 20px; border-radius:100px; font-size:0.85rem; font-weight:500;
    backdrop-filter:blur(12px); z-index:9999;
    transition:all 0.3s ease; opacity:0;
  `;
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';
  });
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ─── Presets system (file-based save/open) ────────────────────────────────────
const btnPresetSave = document.getElementById('btn-preset-save');
const btnPresetOpen = document.getElementById('btn-preset-open');
const presetFileInput = document.getElementById('preset-file-input');

// Save current settings as a .json file
btnPresetSave.addEventListener('click', () => {
  const name = prompt('Nombre del preset:');
  if (!name || !name.trim()) return;

  const preset = {
    name: name.trim(),
    version: '1.0.0',
    app: 'EXED GIF Compressor',
    created: new Date().toISOString(),
    settings: { ...state.settings },
  };

  const blob = new Blob([JSON.stringify(preset, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name.trim().replace(/\s+/g, '_')}.preset.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast(`Preset "${name.trim()}" guardado como archivo`);
});

// Open a .json preset file
btnPresetOpen.addEventListener('click', () => {
  presetFileInput.click();
});

presetFileInput.addEventListener('change', () => {
  const file = presetFileInput.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const preset = JSON.parse(e.target.result);
      const s = preset.settings || preset;

      // Apply preset values to settings and UI controls
      if (s.optimize) optimizeSelect.value = s.optimize;
      if (s.lossy !== undefined) lossySlider.value = s.lossy;
      if (s.scale) scaleSlider.value = s.scale;
      if (s.colors) colorsSlider.value = s.colors;
      onSettingsChanged();

      const label = preset.name || file.name.replace('.preset.json', '');
      showToast(`Preset "${label}" cargado`);
    } catch (err) {
      showToast('Error: archivo de preset inválido', 'warning');
    }
  };
  reader.readAsText(file);
  presetFileInput.value = '';
});

// ─── Init ─────────────────────────────────────────────────────────────────────
updateUI();

// Expose for debugging/testing
window._gifApp = { addFiles, compressAll };

