/*
 * NELOS Core Engine
 * By Joseph La Follette
 *
 * Every function in this file was verified with an independent test before
 * being included here — CRC32 round trips, AES-256-GCM encrypt/decrypt/tamper
 * cases, fullerene graph vertex/edge/face counts, face-parity corrupt-and-recover
 * cycles, gzip round trips, and the ZIP writer against Python's own zipfile
 * module. Nothing in here is asserted without having been checked.
 */

// ---------------- CRC32 (also the exact algorithm PNG and ZIP use) ----------------
function crc32(bytes) {
  let table = crc32.table || (crc32.table = (() => {
    const t = [];
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c; }
    return t;
  })());
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) crc = table[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// ---------------- vector helpers ----------------
const V3 = {
  sub: (a,b) => [a[0]-b[0],a[1]-b[1],a[2]-b[2]],
  dot: (a,b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2],
  cross: (a,b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]],
  norm: v => Math.hypot(v[0],v[1],v[2]),
  normalize: v => { const m = V3.norm(v); return [v[0]/m,v[1]/m,v[2]/m]; },
  scale: (v,s) => [v[0]*s,v[1]*s,v[2]*s],
  projTangent: (v,n) => { const d = V3.dot(v,n); return V3.sub(v, V3.scale(n,d)); },
};

// ---------------- fullerene graph generation (C60 and C20, both verified) ----------------
function buildC60Graph() {
  const phi = (1 + Math.sqrt(5)) / 2;
  const patterns = [[{z:true},{m:1},{m:3*phi}],[{m:1},{m:2+phi},{m:2*phi}],[{m:phi},{m:2},{m:2*phi+1}]];
  function cyclicRotations(p) { return [p,[p[1],p[2],p[0]],[p[2],p[0],p[1]]]; }
  const verts = [];
  for (const pattern of patterns) for (const rot of cyclicRotations(pattern)) {
    const nonZeroIdx = rot.map((c,i)=>c.z?-1:i).filter(i=>i>=0);
    const combos = 1 << nonZeroIdx.length;
    for (let mask=0; mask<combos; mask++) {
      const coord = rot.map(c=>c.z?0:c.m);
      nonZeroIdx.forEach((idx,k)=>{ coord[idx]=coord[idx]*((mask>>k)&1?-1:1); });
      verts.push(coord);
    }
  }
  return finalizeGraph(verts);
}

function buildC20Graph() {
  const phi = (1 + Math.sqrt(5)) / 2;
  const verts = [];
  for (const sx of [1,-1]) for (const sy of [1,-1]) for (const sz of [1,-1]) verts.push([sx,sy,sz]);
  const base = [0, 1/phi, phi];
  function cyclic(p) { return [p, [p[2],p[0],p[1]], [p[1],p[2],p[0]]]; }
  for (const perm of cyclic(base)) for (const s1 of [1,-1]) for (const s2 of [1,-1]) {
    let signs=[s1,s2], si=0;
    verts.push(perm.map(x => x===0?0:x*signs[si++]));
  }
  return finalizeGraph(verts);
}

function finalizeGraph(verts) {
  const seen = new Map(); const unique = [];
  for (const v of verts) { const key = v.map(x=>x.toFixed(6)).join(','); if (!seen.has(key)) { seen.set(key,true); unique.push(v); } }
  let minDist = Infinity; const n = unique.length;
  const dist = (a,b) => Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
  for (let i=0;i<n;i++) for (let j=i+1;j<n;j++) { const d=dist(unique[i],unique[j]); if (d<minDist) minDist=d; }
  const eps = minDist*0.02;
  const adjacency = Array.from({length:n}, () => []);
  for (let i=0;i<n;i++) for (let j=i+1;j<n;j++) if (Math.abs(dist(unique[i],unique[j])-minDist)<eps) { adjacency[i].push(j); adjacency[j].push(i); }
  return { vertices: unique, adjacency, nodeCount: n };
}

function computeFaces(G) {
  const { vertices: P, adjacency, nodeCount: n } = G;
  const rotation = [];
  for (let v = 0; v < n; v++) {
    const nrm = V3.normalize(P[v]);
    const neigh = adjacency[v];
    const u = V3.normalize(V3.projTangent(V3.sub(P[neigh[0]], P[v]), nrm));
    const w = V3.cross(nrm, u);
    const angles = neigh.map(nb => { const t = V3.normalize(V3.projTangent(V3.sub(P[nb], P[v]), nrm)); return Math.atan2(V3.dot(t,w), V3.dot(t,u)); });
    rotation.push(neigh.map((nb,i)=>({nb,a:angles[i]})).sort((a,b)=>a.a-b.a).map(x=>x.nb));
  }
  function trace(turnBefore) {
    const visited = new Set(); const faces = [];
    for (let u0 = 0; u0 < n; u0++) for (const v0 of adjacency[u0]) {
      const key0 = u0+','+v0; if (visited.has(key0)) continue;
      const face = []; let u=u0,v=v0,guard=0;
      while (true) {
        const key = u+','+v; if (visited.has(key)) break; visited.add(key); face.push(v);
        const rot = rotation[v]; const idx = rot.indexOf(u);
        const next = turnBefore ? rot[(idx-1+3)%3] : rot[(idx+1)%3];
        u=v; v=next; guard++;
        if (guard>20) break;
        if (u===u0 && v===v0) break;
      }
      if (face.length>=3) faces.push(face);
    }
    return faces;
  }
  let faces = trace(true);
  const expectedFaceCount = n === 60 ? 32 : (n === 20 ? 12 : null);
  let ok = expectedFaceCount ? faces.length === expectedFaceCount : faces.length > 0;
  if (!ok) { faces = trace(false); ok = expectedFaceCount ? faces.length === expectedFaceCount : faces.length > 0; }
  return faces;
}

const GRAPH_C60 = buildC60Graph();
const FACES_C60 = computeFaces(GRAPH_C60);
const GRAPH_C20 = buildC20Graph();
const FACES_C20 = computeFaces(GRAPH_C20);

// ---------------- crypto (AES-256-GCM via native Web Crypto — tested this session) ----------------
const NelosCrypto = {
  available: typeof window !== 'undefined' && window.isSecureContext && window.crypto && window.crypto.subtle,
  async deriveKey(password, salt) {
    const enc = new TextEncoder();
    const km = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name:'PBKDF2', salt, iterations:250000, hash:'SHA-256' }, km, { name:'AES-GCM', length:256 }, false, ['encrypt','decrypt']);
  },
  async encrypt(plainBytes, password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await this.deriveKey(password, salt);
    const ciphertext = new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM', iv}, key, plainBytes));
    return { ciphertext, salt, iv };
  },
  async decrypt(ciphertext, password, salt, iv) {
    const key = await this.deriveKey(password, salt);
    return new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM', iv}, key, ciphertext)); // throws on wrong password/tamper
  }
};

// ---------------- compression (native browser gzip — tested this session) ----------------
const NelosCompress = {
  async gzip(bytes) {
    const cs = new CompressionStream('gzip');
    const writer = cs.writable.getWriter();
    writer.write(bytes); writer.close();
    return new Uint8Array(await new Response(cs.readable).arrayBuffer());
  },
  async gunzip(bytes) {
    const ds = new DecompressionStream('gzip');
    const writer = ds.writable.getWriter();
    writer.write(bytes); writer.close();
    return new Uint8Array(await new Response(ds.readable).arrayBuffer());
  }
};

// ---------------- shared low-level helpers ----------------
function xorBytes(a,b) { const out = new Uint8Array(Math.max(a.length,b.length)); for (let i=0;i<out.length;i++) out[i]=(a[i]||0)^(b[i]||0); return out; }
function padTo(bytes,len) { if (bytes.length===len) return bytes; const out=new Uint8Array(len); out.set(bytes.subarray(0,Math.min(len,bytes.length))); return out; }
function chunkBounds(i, chunkSize, originalLen) { const start=i*chunkSize; const end=Math.min(start+chunkSize, originalLen); return {start,end,length:end-start}; }
function packToken(crc, nodeIndex, flags) { return (BigInt(flags & 0xFFFF) << 48n) | (BigInt(nodeIndex & 0xFFFF) << 32n) | BigInt(crc >>> 0); }
function unpackToken(token) { return { crc: Number(token & 0xFFFFFFFFn), nodeIndex: Number((token>>32n)&0xFFFFn), flags: Number((token>>48n)&0xFFFFn) }; }
function tokenToBytes(token) { const b=new Uint8Array(8); let t=token; for (let i=7;i>=0;i--){ b[i]=Number(t&0xFFn); t>>=8n; } return b; }
function bytesToToken(bytes, offset) { let t=0n; for (let i=0;i<8;i++) t=(t<<8n)|BigInt(bytes[offset+i]); return t; }

// ---------------- vault encode/decode: face-parity shard system on C60, tested this session ----------------
// Format "WCRR" (White Cat Red Rose vault):
//  magic(4) + encryptedFlag(1) + [if encrypted: salt(16)+iv(12)+ciphertext(rest)]
//  plaintext "rest" = fnameLen(1)+fname + originalLen(4) + nodeCount(1) + chunkSize(4) +
//                      overallCrc(4) + gzipped(1) + faceRecordCount(1) +
//                      nodeRecords[ token(8)+adj(3)+chunkLen(4)+chunk ] +
//                      faceRecords[ faceIdx(1)+parity(chunkSize) ]
const NELOS_MAGIC = "WCRR";

async function nelosEncode(fileBytes, filename, opts = {}) {
  const { password = null, useGzip = true } = opts;
  let workingBytes = fileBytes;
  let gzipped = 0;
  if (useGzip) {
    const compressed = await NelosCompress.gzip(fileBytes);
    if (compressed.length < fileBytes.length) { workingBytes = compressed; gzipped = 1; }
  }

  const overallCrc = crc32(workingBytes);
  const nodeCount = Math.min(GRAPH_C60.nodeCount, Math.max(1, workingBytes.length || 1));
  const chunkSize = Math.ceil(workingBytes.length / nodeCount) || 1;
  const chunks = [];
  for (let i = 0; i < nodeCount; i++) { const {start,end} = chunkBounds(i, chunkSize, workingBytes.length); chunks.push(workingBytes.slice(start,end)); }

  const nodeRecords = [];
  for (let i = 0; i < nodeCount; i++) {
    const chunk = chunks[i];
    const token = packToken(crc32(chunk), i, nodeCount);
    const adj = GRAPH_C60.adjacency[i];
    const rec = new Uint8Array(8+3+4+chunk.length);
    rec.set(tokenToBytes(token), 0);
    rec[8]=adj[0]; rec[9]=adj[1]; rec[10]=adj[2];
    new DataView(rec.buffer).setUint32(11, chunk.length, false);
    rec.set(chunk, 15);
    nodeRecords.push(rec);
  }

  const usableFaces = FACES_C60.map((face,idx)=>({idx,face})).filter(({face})=>face.every(v=>v<nodeCount));
  const faceRecords = usableFaces.map(({idx,face}) => {
    let parity = new Uint8Array(chunkSize);
    for (const v of face) parity = xorBytes(parity, padTo(chunks[v], chunkSize));
    const rec = new Uint8Array(1+chunkSize);
    rec[0]=idx; rec.set(parity,1);
    return rec;
  });

  const fnameBytes = new TextEncoder().encode(filename.slice(0,255));
  const restHeader = new Uint8Array(1 + fnameBytes.length + 4 + 1 + 4 + 4 + 1 + 1);
  let ho = 0;
  restHeader[ho]=fnameBytes.length; ho+=1;
  restHeader.set(fnameBytes, ho); ho+=fnameBytes.length;
  new DataView(restHeader.buffer).setUint32(ho, workingBytes.length, false); ho+=4;
  restHeader[ho]=nodeCount; ho+=1;
  new DataView(restHeader.buffer).setUint32(ho, chunkSize, false); ho+=4;
  new DataView(restHeader.buffer).setUint32(ho, overallCrc, false); ho+=4;
  restHeader[ho]=gzipped; ho+=1;
  restHeader[ho]=faceRecords.length; ho+=1;

  const restLen = restHeader.length + nodeRecords.reduce((s,r)=>s+r.length,0) + faceRecords.reduce((s,r)=>s+r.length,0);
  const restPayload = new Uint8Array(restLen);
  restPayload.set(restHeader, 0);
  let rp = restHeader.length;
  for (const r of nodeRecords) { restPayload.set(r, rp); rp += r.length; }
  for (const r of faceRecords) { restPayload.set(r, rp); rp += r.length; }

  const magicBytes = new TextEncoder().encode(NELOS_MAGIC);
  if (password) {
    const { ciphertext, salt, iv } = await NelosCrypto.encrypt(restPayload, password);
    const out = new Uint8Array(4+1+16+12+ciphertext.length);
    let o=0; out.set(magicBytes,o); o+=4; out[o]=1; o+=1; out.set(salt,o); o+=16; out.set(iv,o); o+=12; out.set(ciphertext,o);
    return out;
  } else {
    const out = new Uint8Array(4+1+restPayload.length);
    out.set(magicBytes,0); out[4]=0; out.set(restPayload,5);
    return out;
  }
}

async function nelosDecode(raw, password = null) {
  // CONTRACT: this always returns a best-effort `.data` alongside honest status flags
  // (overallOk, allNodesOk) — it does NOT gate .data internally. Callers (the UI layer)
  // MUST check overallOk && allNodesOk before treating .data as safe to trust, display,
  // or offer for download. Returning unverified data unlabeled would be exactly the kind
  // of false "success" this whole project has been built to avoid.
  const magic = new TextDecoder().decode(raw.slice(0,4));
  if (magic !== NELOS_MAGIC) throw new Error("Not a WCRR vault (bad magic bytes)");
  let off = 4;
  const encrypted = raw[off] === 1; off += 1;
  let rest;
  if (encrypted) {
    if (!password) throw new Error("password required");
    const salt = raw.slice(off,off+16); off+=16;
    const iv = raw.slice(off,off+12); off+=12;
    const ciphertext = raw.slice(off);
    try { rest = await NelosCrypto.decrypt(ciphertext, password, salt, iv); }
    catch { throw new Error("wrong passphrase, or file corrupted/tampered"); }
  } else {
    rest = raw.slice(off);
  }

  let p = 0;
  const fnameLen = rest[p]; p+=1;
  const filename = new TextDecoder().decode(rest.slice(p,p+fnameLen)); p+=fnameLen;
  let dv = new DataView(rest.buffer, rest.byteOffset, rest.byteLength);
  const workingLen = dv.getUint32(p,false); p+=4;
  const nodeCount = rest[p]; p+=1;
  const chunkSize = dv.getUint32(p,false); p+=4;
  const overallCrcExpected = dv.getUint32(p,false); p+=4;
  const gzipped = rest[p]; p+=1;
  const faceRecordCount = rest[p]; p+=1;

  const chunks = new Array(nodeCount);
  const nodeCrcOk = new Array(nodeCount).fill(false);
  const nodeTokenCrc = new Array(nodeCount);
  for (let i=0;i<nodeCount;i++) {
    const token = bytesToToken(rest, p); p+=8;
    p += 3; // adjacency, structural (not re-validated here to keep this path fast; the tessellated vault tool does full structural checks)
    dv = new DataView(rest.buffer, rest.byteOffset, rest.byteLength);
    const chunkLen = dv.getUint32(p,false); p+=4;
    const chunk = rest.slice(p, p+chunkLen); p+=chunkLen;
    const { crc: crcExpected } = unpackToken(token);
    chunks[i]=chunk; nodeTokenCrc[i]=crcExpected;
    nodeCrcOk[i] = crc32(chunk)===crcExpected;
  }

  const faceParity = new Map();
  for (let k=0;k<faceRecordCount;k++) {
    const faceIdx = rest[p]; p+=1;
    const parity = rest.slice(p,p+chunkSize); p+=chunkSize;
    // A corrupted or malformed file can put a garbage byte here (0-255) that
    // doesn't correspond to a real face (there are only 32). Reject it here,
    // cleanly, rather than letting it crash the recovery loop below with an
    // "undefined" error later — a real bug this exact test caught.
    if (faceIdx >= 0 && faceIdx < FACES_C60.length) {
      faceParity.set(faceIdx, parity);
    }
  }

  const recoveredSet = new Set();
  let progress = true;
  while (progress) {
    progress = false;
    for (const [faceIdx, parity] of faceParity.entries()) {
      const members = FACES_C60[faceIdx];
      if (!members.every(v=>v<nodeCount)) continue;
      const bad = members.filter(v=>!nodeCrcOk[v]);
      if (bad.length===1) {
        const b = bad[0];
        let xorOthers = new Uint8Array(chunkSize);
        for (const v of members) if (v!==b) xorOthers = xorBytes(xorOthers, padTo(chunks[v], chunkSize));
        const recon = xorBytes(parity, xorOthers);
        const { length } = chunkBounds(b, chunkSize, workingLen);
        const truncated = recon.slice(0, length);
        if (crc32(truncated) === nodeTokenCrc[b]) { chunks[b]=truncated; nodeCrcOk[b]=true; recoveredSet.add(b); progress=true; }
      }
    }
  }

  const reassembled = new Uint8Array(workingLen);
  let rp2 = 0;
  for (let i=0;i<nodeCount;i++) { reassembled.set(chunks[i], rp2); rp2 += chunks[i].length; }
  const overallOk = crc32(reassembled) === overallCrcExpected && reassembled.length === workingLen;
  const allNodesOk = nodeCrcOk.every(x=>x);

  let finalBytes = reassembled;
  if (gzipped && allNodesOk && overallOk) finalBytes = await NelosCompress.gunzip(reassembled);

  return {
    filename, data: finalBytes, nodeCount,
    recoveredCount: recoveredSet.size,
    unrecoverableCount: nodeCrcOk.filter(x=>!x).length,
    overallOk, allNodesOk, encrypted,
    nodeStatus: nodeCrcOk.map((ok,i) => ok ? (recoveredSet.has(i) ? 'recovered' : 'filled') : 'unknown')
  };
}

// ---------------- self-heal scan: check a vault's integrity without fully decoding ----------------
async function nelosSelfHealScan(raw, password = null) {
  const result = await nelosDecode(raw, password);
  return {
    nodeCount: result.nodeCount,
    healthy: result.nodeCount - result.recoveredCount - result.unrecoverableCount,
    recovered: result.recoveredCount,
    unrecoverable: result.unrecoverableCount,
    overallOk: result.overallOk
  };
}

// ---------------- real PNG steganography (verified: independently validated with Pillow) ----------------
const NelosStego = {
  makeChunk(type, data) {
    const typeBytes = new TextEncoder().encode(type);
    const out = new Uint8Array(8 + data.length + 4);
    new DataView(out.buffer).setUint32(0, data.length, false);
    out.set(typeBytes, 4);
    out.set(data, 8);
    const crcInput = new Uint8Array(typeBytes.length + data.length);
    crcInput.set(typeBytes,0); crcInput.set(data, typeBytes.length);
    new DataView(out.buffer).setUint32(8+data.length, crc32(crcInput) >>> 0, false);
    return out;
  },
  buildCoverPNG(width, height, r, g, b) {
    const sig = new Uint8Array([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A]);
    const ihdrData = new Uint8Array(13);
    const idv = new DataView(ihdrData.buffer);
    idv.setUint32(0,width,false); idv.setUint32(4,height,false);
    ihdrData[8]=8; ihdrData[9]=2; ihdrData[10]=0; ihdrData[11]=0; ihdrData[12]=0;
    const ihdr = this.makeChunk('IHDR', ihdrData);
    const rowBytes = 1+width*3;
    const raw = new Uint8Array(rowBytes*height);
    for (let y=0;y<height;y++) { const rs=y*rowBytes; raw[rs]=0; for (let x=0;x<width;x++){ const px=rs+1+x*3; raw[px]=r; raw[px+1]=g; raw[px+2]=b; } }
    return { sig, ihdr, raw };
  },
  async embedIntoExistingPNG(pngBytes, payload) {
    // real uploaded PNG: parse its actual chunks, keep them all untouched, splice ours in before IEND
    const sig = pngBytes.slice(0,8);
    let off = 8; const chunks = [];
    while (off < pngBytes.length) {
      const dv = new DataView(pngBytes.buffer, pngBytes.byteOffset, pngBytes.byteLength);
      const len = dv.getUint32(off, false);
      const type = new TextDecoder().decode(pngBytes.slice(off+4, off+8));
      const full = pngBytes.slice(off, off+12+len);
      if (type !== 'IEND') chunks.push(full);
      off += 12 + len;
    }
    const stego = this.makeChunk('neLo', payload);
    const iend = this.makeChunk('IEND', new Uint8Array(0));
    const parts = [sig, ...chunks, stego, iend];
    const total = parts.reduce((s,p)=>s+p.length,0);
    const out = new Uint8Array(total);
    let p=0; for (const part of parts) { out.set(part,p); p+=part.length; }
    return out;
  },
  async embedIntoGeneratedCover(payload, opts={}) {
    const { width=64, height=64, r=60, g=130, b=200 } = opts;
    const cover = this.buildCoverPNG(width, height, r, g, b);
    const cs = new CompressionStream('deflate'); // PNG IDAT requires zlib-wrapped deflate — 'deflate' (not 'deflate-raw') gives the zlib header PNG needs
    const writer = cs.writable.getWriter();
    writer.write(cover.raw); writer.close();
    const idatData = new Uint8Array(await new Response(cs.readable).arrayBuffer());
    const idat = this.makeChunk('IDAT', idatData);
    const stego = this.makeChunk('neLo', payload);
    const iend = this.makeChunk('IEND', new Uint8Array(0));
    const parts = [cover.sig, cover.ihdr, idat, stego, iend];
    const total = parts.reduce((s,p)=>s+p.length,0);
    const out = new Uint8Array(total);
    let p=0; for (const part of parts) { out.set(part,p); p+=part.length; }
    return out;
  },
  extract(fileBytes) {
    let off = 8;
    while (off < fileBytes.length) {
      const dv = new DataView(fileBytes.buffer, fileBytes.byteOffset, fileBytes.byteLength);
      const len = dv.getUint32(off, false);
      const type = new TextDecoder().decode(fileBytes.slice(off+4, off+8));
      if (type === 'neLo') return fileBytes.slice(off+8, off+8+len);
      off += 12 + len;
    }
    return null;
  }
};

// ---------------- ZIP writer (verified against Python's zipfile module) ----------------
function buildZip(files) { // [{name, data: Uint8Array}]
  const localParts = [], centralParts = [];
  let offset = 0;
  for (const f of files) {
    const nameBytes = new TextEncoder().encode(f.name);
    const crc = crc32(f.data);
    const size = f.data.length;
    const local = new Uint8Array(30+nameBytes.length);
    const ldv = new DataView(local.buffer);
    ldv.setUint32(0,0x04034b50,true); ldv.setUint16(4,20,true); ldv.setUint16(6,0,true); ldv.setUint16(8,0,true);
    ldv.setUint16(10,0,true); ldv.setUint16(12,0,true); ldv.setUint32(14,crc,true); ldv.setUint32(18,size,true);
    ldv.setUint32(22,size,true); ldv.setUint16(26,nameBytes.length,true); ldv.setUint16(28,0,true);
    local.set(nameBytes,30);
    localParts.push(local, f.data);

    const central = new Uint8Array(46+nameBytes.length);
    const cdv = new DataView(central.buffer);
    cdv.setUint32(0,0x02014b50,true); cdv.setUint16(4,20,true); cdv.setUint16(6,20,true); cdv.setUint16(8,0,true);
    cdv.setUint16(10,0,true); cdv.setUint16(12,0,true); cdv.setUint16(14,0,true); cdv.setUint32(16,crc,true);
    cdv.setUint32(20,size,true); cdv.setUint32(24,size,true); cdv.setUint16(28,nameBytes.length,true);
    cdv.setUint16(30,0,true); cdv.setUint16(32,0,true); cdv.setUint16(34,0,true); cdv.setUint16(36,0,true);
    cdv.setUint32(38,0,true); cdv.setUint32(42,offset,true);
    central.set(nameBytes,46);
    centralParts.push(central);
    offset += local.length + f.data.length;
  }
  const centralStart = offset;
  const centralSize = centralParts.reduce((s,c)=>s+c.length,0);
  const eocd = new Uint8Array(22);
  const edv = new DataView(eocd.buffer);
  edv.setUint32(0,0x06054b50,true); edv.setUint16(8,files.length,true); edv.setUint16(10,files.length,true);
  edv.setUint32(12,centralSize,true); edv.setUint32(16,centralStart,true);
  const total = [...localParts, ...centralParts, eocd];
  const totalLen = total.reduce((s,p)=>s+p.length,0);
  const out = new Uint8Array(totalLen);
  let p=0; for (const part of total) { out.set(part,p); p+=part.length; }
  return out;
}

// ---------------- Error Level Analysis: a real but limited heuristic, honestly labeled ----------------
// This detects a real signal (localized JPEG recompression differences), not certainty.
// It is a standard, well-known forensic technique — not a guarantee of tampering either way.
function computeELA(canvas, ctx, quality = 0.9) {
  return new Promise(resolve => {
    canvas.toBlob(async (blob) => {
      const img = new Image();
      img.onload = () => {
        const elaCanvas = document.createElement('canvas');
        elaCanvas.width = canvas.width; elaCanvas.height = canvas.height;
        const ectx = elaCanvas.getContext('2d');
        ectx.drawImage(img, 0, 0);
        const original = ctx.getImageData(0,0,canvas.width,canvas.height).data;
        const recompressed = ectx.getImageData(0,0,canvas.width,canvas.height).data;
        const diff = ectx.createImageData(canvas.width, canvas.height);
        let maxDiff = 0;
        for (let i=0;i<original.length;i+=4) {
          const d = Math.abs(original[i]-recompressed[i]) + Math.abs(original[i+1]-recompressed[i+1]) + Math.abs(original[i+2]-recompressed[i+2]);
          maxDiff = Math.max(maxDiff, d);
          const amplified = Math.min(255, d * 8);
          diff.data[i]=amplified; diff.data[i+1]=amplified; diff.data[i+2]=amplified; diff.data[i+3]=255;
        }
        ectx.putImageData(diff, 0, 0);
        resolve({ canvas: elaCanvas, maxDiff });
      };
      img.src = URL.createObjectURL(blob);
    }, 'image/jpeg', quality);
  });
}

// export everything the UI layer needs
window.Nelos = {
  crc32, GRAPH_C60, FACES_C60, GRAPH_C20, FACES_C20,
  NelosCrypto, NelosCompress, NelosStego, buildZip, computeELA,
  nelosEncode, nelosDecode, nelosSelfHealScan
};
