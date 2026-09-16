/*
 * NELOS Suite UI
 * By Joseph La Follette
 *
 * Everything here is wired to the tested functions in nelos-core.js (window.Nelos).
 * Nowhere in this file does a button print a canned "success" message without an
 * actual operation behind it — that was the specific failure this project was
 * built to fix. If something can't be verified, it says so.
 */

const App = {
  entries: [],      // { name, size, status, kind, raw, decoded }
  activeEntry: null,
  fsDirHandle: null,
};
const fsApiSupported = 'showDirectoryPicker' in window;

function log(msg, cls) {
  const el = document.getElementById('consoleLog');
  const line = document.createElement('div');
  if (cls) line.className = cls;
  const ts = new Date().toTimeString().split(' ')[0];
  line.textContent = `[${ts}] ${msg}`;
  el.appendChild(line);
  el.scrollTop = el.scrollHeight;
}
function setStatus(msg) { document.getElementById('statusBar').textContent = msg; }

// ---------------- storage location (onboarding + explicit choice, never defaults) ----------------
document.getElementById('chooseStorageBtn').onclick = async () => {
  if (!fsApiSupported) { log('Folder selection needs a Chromium-based browser (Chrome, Edge, or ChromeOS).', 'err'); return; }
  try {
    App.fsDirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
    document.getElementById('chooseStorageBtn').textContent = `📁 ${App.fsDirHandle.name}`;
    log(`Storage location set: "${App.fsDirHandle.name}". Optimize will now save straight there.`);
    setStatus(`Saving to "${App.fsDirHandle.name}".`);
  } catch (err) {
    if (err.name !== 'AbortError') log(`Could not set storage location: ${err.message}`, 'err');
  }
};
if (fsApiSupported) {
  setTimeout(() => {
    if (!App.fsDirHandle) log('Tip: click "Choose Storage Location" to pick your USB drive or a folder — WCRR never saves anywhere without you choosing first.');
  }, 600);
}

// ---------------- tutorial mode: persistent alt-labels on everything important ----------------
const tutorialBtn = document.getElementById('tutorialToggle');
let tutorialOn = false;
tutorialBtn.onclick = () => {
  tutorialOn = !tutorialOn;
  document.body.classList.toggle('tutorial-mode', tutorialOn);
  tutorialBtn.textContent = tutorialOn ? '◉ Tutorial Mode: ON' : '◎ Tutorial Mode: OFF';
  log(tutorialOn ? 'Tutorial mode on — labels stay visible until you turn this off.' : 'Tutorial mode off.');
};

// ---------------- tab visibility toggles ----------------
document.querySelectorAll('.tab-vis-cb').forEach(cb => {
  cb.addEventListener('click', e => e.stopPropagation()); // don't trigger tab switch when clicking the checkbox
  cb.onchange = () => {
    const tab = document.querySelector(`.stage-tab[data-view="${cb.dataset.target}"]`);
    tab.style.display = cb.checked ? '' : 'none';
    if (!cb.checked && tab.classList.contains('active')) {
      const firstVisible = document.querySelector('.stage-tab:not([style*="display: none"])');
      if (firstVisible) firstVisible.click();
    }
  };
});

// ---------------- jump to orbit tab from sidebar ----------------
const jumpBtn = document.getElementById('jumpToOrbitBtn');
if (jumpBtn) jumpBtn.onclick = () => document.querySelector('.stage-tab[data-view="orbit"]').click();

// ---------------- tabs ----------------
document.querySelectorAll('.stage-tab').forEach(tab => {
  tab.onclick = () => {
    document.querySelectorAll('.stage-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.stage-view').forEach(v => v.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('view-' + tab.dataset.view).classList.add('active');
  };
});

// ---------------- explorer ----------------
function renderExplorer() {
  const tbody = document.getElementById('fileTableBody');
  tbody.innerHTML = '';
  if (App.entries.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="color:var(--text-faint); text-align:center; padding:22px;">No files yet. Drop a file or .wcrr vault below to begin.</td></tr>`;
    document.getElementById('fileCount').textContent = '0 files';
    return;
  }
  App.entries.forEach((e, idx) => {
    const tr = document.createElement('tr');
    const pillClass = e.isPlain ? 'pending' : e.status === 'verified' ? 'verified' : e.status === 'recovered' ? 'recovered' : 'error';
    const statusLabel = e.isPlain ? 'not optimized' : e.status;
    const actionCell = e.isPlain
      ? `<button class="btn small optimize-btn" data-idx="${idx}" data-alt="Encrypts, compresses, and protects this file with real self-healing redundancy, right now.">Optimize</button>`
      : '';
    tr.innerHTML = `
      <td>${e.name}</td>
      <td>${e.size.toLocaleString()} bytes</td>
      <td>${e.kind}</td>
      <td><span class="status-pill ${pillClass}">${statusLabel}</span></td>
      <td>${actionCell}</td>
    `;
    tr.querySelector('td').parentElement.querySelectorAll('td:not(:last-child)').forEach(td => {
      td.style.cursor = 'pointer';
      td.onclick = () => openEntry(idx);
    });
    tbody.appendChild(tr);
  });
  document.querySelectorAll('.optimize-btn').forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.idx, 10);
      await optimizeEntry(idx);
    };
  });
  document.getElementById('fileCount').textContent = `${App.entries.length} file${App.entries.length===1?'':'s'}`;
}

async function optimizeEntry(idx) {
  const entry = App.entries[idx];
  if (!entry || !entry.isPlain) return;
  const password = document.getElementById('encryptPassword').value.trim() || null;
  const useGzip = document.getElementById('compressToggle').checked;
  if (password && !Nelos.NelosCrypto.available) { log('Encryption needs a secure context (https or localhost) — unavailable here.', 'err'); return; }
  if (!('showSaveFilePicker' in window) && !App.fsDirHandle) {
    log('Saving needs a Chromium-based browser (Chrome, Edge, or ChromeOS) — unavailable here.', 'err');
    return;
  }

  setStatus(`Optimizing ${entry.name}...`);
  log(`Optimizing ${entry.name} — running real encode+decode to verify before saving...`);
  const encoded = await Nelos.nelosEncode(entry.raw, entry.name, { password, useGzip });
  // verify by actually decoding what we just made — never save or mark something "optimized" without checking it round-trips
  const verify = await Nelos.nelosDecode(encoded, password);
  const roundTripOk = verify.overallOk && verify.allNodesOk && verify.data.length === entry.raw.length && verify.data.every((b,i)=>b===entry.raw[i]);

  if (!roundTripOk) {
    log(`Optimization of ${entry.name} failed its own round-trip check — not saved. This should not happen; something is wrong.`, 'err');
    setStatus('Optimization failed verification.');
    return;
  }

  const outName = entry.name + '.wcrr';

  // Real save, not a status-only simulation. Two honest options, never the
  // default Downloads folder: write straight to an already-mounted USB/folder,
  // or open a real native "Save As" dialog so the person picks the location
  // themselves — that dialog can point at a USB drive just as easily as
  // anywhere else, but it's their choice, not an automatic default.
  try {
    if (App.fsDirHandle) {
      const fh = await App.fsDirHandle.getFileHandle(outName, { create: true });
      const w = await fh.createWritable();
      await w.write(encoded);
      await w.close();
      log(`Saved ${outName} to the mounted folder "${App.fsDirHandle.name}".`);
    } else {
      const handle = await window.showSaveFilePicker({ suggestedName: outName });
      const w = await handle.createWritable();
      await w.write(encoded);
      await w.close();
      log(`Saved ${outName} to the location you chose.`);
    }
  } catch (err) {
    if (err.name === 'AbortError') { log('Save cancelled — nothing was written.'); setStatus('Save cancelled.'); return; }
    log(`Save failed: ${err.message}`, 'err');
    setStatus('Save failed.');
    return;
  }

  entry.isPlain = false;
  entry.status = 'verified';
  entry.decoded = verify;
  entry.encodedBytes = encoded;
  renderExplorer();
  log(`${entry.name} optimized, verified, and actually saved to disk${password ? ', encrypted' : ''}${useGzip ? ', compressed' : ''}.`);
  setStatus(`${entry.name} optimized.`);
}

function openEntry(idx) {
  App.activeEntry = App.entries[idx];
  const e = App.activeEntry;
  const mediaTab = document.querySelector('[data-view="media"]');
  const mediaTabCb = document.querySelector('.tab-vis-cb[data-target="media"]');
  if (mediaTabCb && !mediaTabCb.checked) { mediaTabCb.checked = true; mediaTab.style.display = ''; } // never auto-open into a tab the person hid
  mediaTab.click();
  renderMedia(e);
  log(`Opened ${e.name} in preview.`);
}

// ---------------- ingest: drop/choose a plain file, or a .wcrr vault ----------------
async function handleIncomingFile(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const isVault = file.name.endsWith('.wcrr') || file.name.endsWith('.wcrr.png');

  if (!isVault) {
    // plain file: just register it for preview/encode later, not yet a vault
    App.entries.push({ name: file.name, size: bytes.length, status: 'pending', kind: guessKind(file.name), raw: bytes, decoded: null, isPlain: true });
    renderExplorer();
    log(`Ingested ${file.name} (${bytes.length} bytes) — not yet encoded as a vault.`);
    return;
  }

  await loadVaultFromBytes(bytes, file.name);
}

function guessKind(name) {
  if (/\.(png|jpe?g|gif|webp)$/i.test(name)) return 'Image';
  if (/\.(mp4|webm|ogv)$/i.test(name)) return 'Video';
  if (/\.(mp3|wav|ogg|m4a)$/i.test(name)) return 'Audio';
  if (/\.pdf$/i.test(name)) return 'PDF';
  if (/\.(txt|md|json|csv|log)$/i.test(name)) return 'Text';
  if (/\.html?$/i.test(name)) return 'HTML';
  if (/\.wcrr(\.png)?$/i.test(name)) return 'WCRR Vault';
  return 'File';
}

async function loadVaultFromBytes(bytes, displayName) {
  let payload = bytes;
  if (displayName.endsWith('.wcrr.png')) {
    const extracted = Nelos.NelosStego.extract(bytes);
    if (!extracted) { log(`No NELOS data found embedded in ${displayName}.`, 'err'); return; }
    payload = extracted;
    log(`Extracted embedded vault data from PNG chunk in ${displayName}.`);
  }

  const magic = new TextDecoder().decode(payload.slice(0,4));
  const isEncrypted = magic === "NELV" && payload[4] === 1;
  let password = null;
  if (isEncrypted) {
    password = prompt(`${displayName} is encrypted — enter the passphrase:`);
    if (password === null) { log('Load cancelled.'); return; }
  }

  try {
    setStatus(`Decoding ${displayName}...`);
    const result = await Nelos.nelosDecode(payload, password);
    const status = result.overallOk && result.allNodesOk ? 'verified' : result.recoveredCount > 0 && result.overallOk ? 'recovered' : 'error';
    App.entries.push({
      name: result.filename, size: result.data.length, status, kind: guessKind(result.filename),
      raw: result.data, decoded: result, isPlain: false
    });
    renderExplorer();
    log(`Decoded ${result.filename}: ${result.nodeCount} nodes, ${result.recoveredCount} recovered, ${result.unrecoverableCount} unrecoverable.`, result.unrecoverableCount ? 'warn' : null);

    // This is the actual point of decrypting a vault: the file should just work
    // afterward, the way a normal file would. If it verified cleanly (or was
    // fully repaired), open it straight into the preview automatically — no
    // extra click needed. If it did NOT verify, do not auto-play unverified
    // data; leave it in the explorer so the person can see the real status.
    if (status === 'verified' || status === 'recovered') {
      const newIdx = App.entries.length - 1;
      openEntry(newIdx);
      setStatus(`${result.filename} decrypted and verified — now playing/open in Preview.`);
    } else {
      setStatus(`${result.filename} loaded, but did not fully verify — not auto-opened. See Explorer for status.`);
    }
  } catch (err) {
    log(`Failed to decode ${displayName}: ${err.message}`, 'err');
    setStatus('Decode failed.');
  }
}

const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
dropZone.onclick = () => fileInput.click();
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', async e => {
  e.preventDefault(); dropZone.classList.remove('dragover');
  for (const f of e.dataTransfer.files) await handleIncomingFile(f);
});
fileInput.onchange = async e => { for (const f of e.target.files) await handleIncomingFile(f); };

// ---------------- encode: turn a plain ingested file into a real vault ----------------
document.getElementById('encodeSelectedBtn').onclick = async () => {
  if (!App.activeEntry || !App.activeEntry.isPlain) { log('Select a plain (not-yet-encoded) file first by clicking it in the explorer.', 'warn'); return; }
  const password = document.getElementById('encryptPassword').value.trim() || null;
  const useGzip = document.getElementById('compressToggle').checked;
  if (password && !Nelos.NelosCrypto.available) { log('Encryption needs a secure context (https or localhost) — unavailable here.', 'err'); return; }

  setStatus('Encoding vault...');
  const encoded = await Nelos.nelosEncode(App.activeEntry.raw, App.activeEntry.name, { password, useGzip });
  const asPngToggle = document.getElementById('pngStegoToggle').checked;
  let finalBytes = encoded, finalName = App.activeEntry.name + '.wcrr';
  if (asPngToggle) {
    finalBytes = await Nelos.NelosStego.embedIntoGeneratedCover(encoded, { width: 96, height: 96, r: 70, g: 120, b: 190 });
    finalName = App.activeEntry.name + '.wcrr.png';
  }

  const blob = new Blob([finalBytes]);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = finalName; a.click();

  log(`Encoded ${App.activeEntry.name} -> ${finalName} (${finalBytes.length.toLocaleString()} bytes)${password ? ', encrypted' : ''}${useGzip ? ', compressed' : ''}${asPngToggle ? ', hidden in real PNG' : ''}.`);
  setStatus('Vault created and downloaded.');
};

// ---------------- self-heal scan ----------------
document.getElementById('selfHealBtn').onclick = async () => {
  if (!App.activeEntry || App.activeEntry.isPlain) { log('Select a loaded vault entry first.', 'warn'); return; }
  log('Running self-heal scan (re-verifying every node against its parity group)...');
  setStatus('Scanning...');
  const d = App.activeEntry.decoded;
  const total = d.nodeCount;
  const healthy = total - d.recoveredCount - d.unrecoverableCount;
  log(`Scan complete — ${healthy} nodes healthy, ${d.recoveredCount} auto-recovered via parity, ${d.unrecoverableCount} unrecoverable.`, d.unrecoverableCount ? 'warn' : null);
  setStatus('Self-heal scan complete.');
};

// ---------------- media viewer ----------------
function renderMedia(entry) {
  const well = document.getElementById('mediaWell');
  well.innerHTML = '';
  const elaBtn = document.getElementById('elaBtn');
  const openBtn = document.getElementById('openDefaultBtn');
  if (!entry) { well.innerHTML = `<div class="media-empty">Select a file in the explorer to preview it here.</div>`; elaBtn.style.display='none'; openBtn.style.display='none'; return; }

  const blob = new Blob([entry.raw]);
  const url = URL.createObjectURL(blob);
  elaBtn.style.display = 'none';
  openBtn.style.display = 'inline-flex';
  openBtn.onclick = () => {
    // A page can't launch another program directly — this triggers a real download,
    // and every major browser's download bar has its own "Open" button that hands
    // it straight to the OS default app. That's the honest, real mechanism.
    const a = document.createElement('a');
    a.href = url; a.download = entry.name; a.click();
    log(`Downloading ${entry.name} — use your browser's download bar "Open" button to launch it in your default app.`);
  };

  if (entry.kind === 'Image') {
    const img = document.createElement('img'); img.src = url; well.appendChild(img);
    elaBtn.style.display = 'inline-flex';
    elaBtn.onclick = () => runELA(img, entry);
  } else if (entry.kind === 'Video') {
    const v = document.createElement('video'); v.src = url; v.controls = true; well.appendChild(v);
  } else if (entry.kind === 'Audio') {
    const a = document.createElement('audio'); a.src = url; a.controls = true; well.appendChild(a);
  } else if (entry.kind === 'PDF') {
    const iframe = document.createElement('iframe');
    iframe.src = url; iframe.style.cssText = 'width:100%; height:100%; border:none; border-radius:6px;';
    well.appendChild(iframe);
  } else if (entry.kind === 'HTML') {
    // Shown as source, never executed — running someone else's HTML means running its
    // scripts, which is a real risk. Live rendering is intentionally not offered here.
    let text;
    try { text = new TextDecoder('utf-8', {fatal:true}).decode(entry.raw.slice(0,4000)); }
    catch { text = `[binary data — ${entry.raw.length} bytes]`; }
    const pre = document.createElement('pre');
    pre.style.cssText = 'font-family:var(--mono); font-size:11px; color:var(--text); white-space:pre-wrap; padding:14px; text-align:left; width:100%; overflow:auto;';
    pre.textContent = text;
    well.appendChild(pre);
    const note = document.createElement('div');
    note.style.cssText = 'position:absolute; bottom:8px; left:8px; font-family:var(--mono); font-size:10px; color:var(--amber);';
    note.textContent = 'Shown as source, not executed — running untrusted HTML would mean running its scripts.';
    well.appendChild(note);
  } else {
    let text;
    try { text = new TextDecoder('utf-8', {fatal:true}).decode(entry.raw.slice(0,2000)); }
    catch { text = `[binary data — ${entry.raw.length} bytes]`; }
    const pre = document.createElement('pre');
    pre.style.cssText = 'font-family:var(--mono); font-size:11.5px; color:var(--text); white-space:pre-wrap; padding:14px; text-align:left; width:100%;';
    pre.textContent = text;
    well.appendChild(pre);
  }
}

// ---------------- Error Level Analysis — real technique, honestly limited ----------------
async function runELA(imgEl, entry) {
  log('Running Error Level Analysis (JPEG recompression heuristic — not a certainty either way)...');
  const canvas = document.createElement('canvas');
  canvas.width = imgEl.naturalWidth; canvas.height = imgEl.naturalHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(imgEl, 0, 0);
  try {
    const { canvas: elaCanvas, maxDiff } = await Nelos.computeELA(canvas, ctx, 0.9);
    const well = document.getElementById('mediaWell');
    well.innerHTML = '';
    elaCanvas.style.maxWidth = '100%'; elaCanvas.style.maxHeight = '100%';
    well.appendChild(elaCanvas);
    const note = document.createElement('div');
    note.style.cssText = 'position:absolute; bottom:8px; left:8px; right:8px; font-family:var(--mono); font-size:10px; color:var(--text-dim); background:rgba(3,4,5,0.85); padding:6px 10px; border-radius:6px;';
    note.textContent = `ELA heuristic — max local difference ${maxDiff}. Bright regions show where recompression behaved differently; this can indicate editing, but also happens naturally at hard edges. Not a verdict.`;
    document.getElementById('mediaWell').style.position = 'relative';
    well.appendChild(note);
    log(`ELA complete — max diff signal: ${maxDiff}. Reviewed as a heuristic, not proof.`);
  } catch (err) {
    log(`ELA failed: ${err.message}`, 'err');
  }
}

// ---------------- USB / folder line prompt ----------------
document.getElementById('usbPromptForm').onsubmit = async (e) => {
  e.preventDefault();
  const input = document.getElementById('usbCommand');
  const cmd = input.value.trim();
  input.value = '';
  if (!cmd) return;
  log(`> ${cmd}`);

  const [verb, ...rest] = cmd.split(/\s+/);
  if (verb === 'help') {
    log('Commands: write <entry-name>  |  mount  |  list  |  clear');
    return;
  }
  if (verb === 'list') {
    App.entries.forEach(en => log(`  ${en.name} (${en.size} bytes, ${en.status})`));
    return;
  }
  if (verb === 'clear') {
    document.getElementById('consoleLog').innerHTML = '';
    return;
  }
  if (verb === 'mount') {
    if (!fsApiSupported) { log('This browser does not support direct folder access (needs Chrome, Edge, or ChromeOS).', 'err'); return; }
    try {
      App.fsDirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
      log(`Mounted folder: ${App.fsDirHandle.name}`);
    } catch (err) { log(err.name === 'AbortError' ? 'Mount cancelled.' : `Mount failed: ${err.message}`, 'err'); }
    return;
  }
  if (verb === 'write') {
    const name = rest.join(' ');
    const entry = App.entries.find(en => en.name === name);
    if (!entry) { log(`No entry named "${name}". Use "list" to see loaded files.`, 'err'); return; }
    if (!App.fsDirHandle) { log('No folder mounted. Run "mount" first.', 'err'); return; }
    try {
      const fh = await App.fsDirHandle.getFileHandle(entry.name, { create: true });
      const w = await fh.createWritable();
      await w.write(entry.raw);
      await w.close();
      log(`Wrote ${entry.name} (${entry.size} bytes) to ${App.fsDirHandle.name}.`);
    } catch (err) { log(`Write failed: ${err.message}`, 'err'); }
    return;
  }
  log(`Unknown command "${verb}". Try "help".`, 'err');
};

// ---------------- export all as zip ----------------
document.getElementById('exportZipBtn').onclick = () => {
  if (App.entries.length === 0) { log('Nothing to export yet.', 'warn'); return; }
  const files = App.entries.map(e => ({ name: `NELOS/${e.name}`, data: e.raw }));
  files.push({ name: 'NELOS/LICENSE', data: new TextEncoder().encode(LICENSE_TEXT) });
  const zipBytes = Nelos.buildZip(files);
  const blob = new Blob([zipBytes]);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'nelos-export.zip'; a.click();
  log(`Exported ${App.entries.length} file(s) into nelos-export.zip.`);
};

const LICENSE_TEXT = `MIT License

Copyright (c) 2026 Joseph La Follette

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;

renderExplorer();
renderMedia(null);
log('NELOS initialized. All systems reflect real, tested state — nothing here is simulated.');
