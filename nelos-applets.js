/*
 * NELOS Applets
 * By Joseph La Follette
 *
 * Trigger-Value Lookup: a real store/retrieve primitive — tested independently
 * in both Python and JS before this file was written (see conversation record).
 *
 * Geometric Calculator: real questions answered with the actual C60/C20 graph
 * data already in nelos-core.js — hop distances via real BFS, redundancy
 * overhead from the real face counts. No invented tensor math, no unexplained
 * constants — every number here traces back to something we verified.
 */

// ---------------- Trigger-Value Lookup ----------------
class TriggerStore {
  constructor(bits = 3) {
    this.slots = new Map();
    this.mask = (1 << bits) - 1;
  }
  store(triggerValue, payload) {
    const key = triggerValue & this.mask;
    this.slots.set(key, payload);
    return key;
  }
  retrieve(triggerValue) {
    const key = triggerValue & this.mask;
    if (!this.slots.has(key)) throw new Error(`Nothing stored at trigger=${key} yet.`);
    return this.slots.get(key);
  }
}

const triggerStore = new TriggerStore(3); // 8 real slots (0-7)

function triggerLog(msg) {
  const el = document.getElementById('triggerLog');
  const line = document.createElement('div');
  line.textContent = msg;
  el.appendChild(line);
  el.scrollTop = el.scrollHeight;
}

document.getElementById('triggerStoreBtn').onclick = () => {
  const key = parseInt(document.getElementById('triggerKeyInput').value, 10) || 0;
  const msg = document.getElementById('triggerMsgInput').value;
  if (!msg) { triggerLog('Type something to store first.'); return; }
  const stored = triggerStore.store(key, msg);
  triggerLog(`STORED at trigger=${stored}: "${msg}"`);
};

document.getElementById('triggerRetrieveBtn').onclick = () => {
  const key = parseInt(document.getElementById('triggerKeyInput').value, 10) || 0;
  try {
    const got = triggerStore.retrieve(key);
    triggerLog(`RETRIEVED at trigger=${key}: "${got}"`);
  } catch (err) {
    triggerLog(`(nothing stored at trigger=${key} yet)`);
  }
};

// ---------------- Geometric Calculator ----------------
function bfsHops(adjacency, start, end) {
  if (start === end) return 0;
  const visited = new Array(adjacency.length).fill(false);
  visited[start] = true;
  let queue = [start], hops = 0;
  while (queue.length) {
    hops++;
    const next = [];
    for (const u of queue) for (const v of adjacency[u]) {
      if (v === end) return hops;
      if (!visited[v]) { visited[v] = true; next.push(v); }
    }
    queue = next;
  }
  return -1;
}

function calcLog(msg) {
  const el = document.getElementById('calcLog');
  const line = document.createElement('div');
  line.textContent = msg;
  el.appendChild(line);
  el.scrollTop = el.scrollHeight;
}

document.getElementById('calcHopsBtn').onclick = () => {
  const structure = document.getElementById('calcStructure').value;
  const a = parseInt(document.getElementById('calcNodeA').value, 10) || 0;
  const b = parseInt(document.getElementById('calcNodeB').value, 10) || 0;
  const graph = structure === 'c60' ? Nelos.GRAPH_C60 : Nelos.GRAPH_C20;
  if (a < 0 || a >= graph.nodeCount || b < 0 || b >= graph.nodeCount) {
    calcLog(`Both nodes must be between 0 and ${graph.nodeCount - 1} for ${structure.toUpperCase()}.`);
    return;
  }
  const hops = bfsHops(graph.adjacency, a, b);
  calcLog(`${structure.toUpperCase()}: real shortest path from node ${a} to node ${b} = ${hops} hop${hops===1?'':'s'} (computed live via BFS on the actual graph).`);
};

document.getElementById('calcOverheadBtn').onclick = () => {
  const c60Overhead = (Nelos.FACES_C60.length / Nelos.GRAPH_C60.nodeCount * 100).toFixed(1);
  const c20Overhead = (Nelos.FACES_C20.length / Nelos.GRAPH_C20.nodeCount * 100).toFixed(1);
  calcLog(`Real redundancy overhead: C60 = ${Nelos.FACES_C60.length} parity blocks / ${Nelos.GRAPH_C60.nodeCount} data nodes = ${c60Overhead}% extra storage. C20 = ${Nelos.FACES_C20.length} / ${Nelos.GRAPH_C20.nodeCount} = ${c20Overhead}% extra storage.`);
};

document.getElementById('calcDiameterBtn').onclick = () => {
  const structure = document.getElementById('calcStructure').value;
  const graph = structure === 'c60' ? Nelos.GRAPH_C60 : Nelos.GRAPH_C20;
  let maxHops = 0;
  for (let i=0;i<graph.nodeCount;i++) for (let j=i+1;j<graph.nodeCount;j++) {
    const h = bfsHops(graph.adjacency, i, j);
    if (h > maxHops) maxHops = h;
  }
  calcLog(`${structure.toUpperCase()}: real computed diameter (worst-case hops between any two nodes) = ${maxHops}. Computed live just now, not looked up.`);
};

calcLog('Geometric calculator ready. Every number here is computed live from the real graph — nothing pre-scripted.');
triggerLog('Trigger-Value Lookup ready. 8 real slots (0-7).');
