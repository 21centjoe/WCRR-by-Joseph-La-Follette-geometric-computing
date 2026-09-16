/*
 * NELOS Visualization Layer
 * By Joseph La Follette
 *
 * The structure panel and tour both render Nelos.GRAPH_C60 / Nelos.GRAPH_C20 —
 * the exact same graph data the encoder and decoder use. Nothing here is a
 * separate decorative model; it's the real structure, visualized.
 */

// ---------------- orbit tab: nested C60 (outer) + C20 (inner), real live graph ----------------
(function initStructurePanel() {
  const container = document.getElementById('orbitCanvas');
  const c60Stats = document.getElementById('orbitC60Stats');
  const c20Stats = document.getElementById('orbitC20Stats');
  if (c60Stats) c60Stats.textContent = `${Nelos.GRAPH_C60.nodeCount} nodes, ${Nelos.FACES_C60.length} faces`;
  if (c20Stats) c20Stats.textContent = `${Nelos.GRAPH_C20.nodeCount} nodes, ${Nelos.FACES_C20.length} faces`;
  const miniStats = document.getElementById('miniStructureStats');
  if (miniStats) miniStats.textContent = `C60 (${Nelos.GRAPH_C60.nodeCount}) · C20 (${Nelos.GRAPH_C20.nodeCount})`;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 2000);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight(0x3a5570, 1.2));
  const light = new THREE.PointLight(0x3ddad0, 1.5, 0);
  light.position.set(80, 80, 100);
  scene.add(light);

  const group = new THREE.Group();
  scene.add(group);

  function addGraphMesh(graph, scale, color, opacity) {
    const positions = [];
    const edgeSeen = new Set();
    graph.adjacency.forEach((neigh, i) => {
      neigh.forEach(j => {
        const key = Math.min(i,j)+'_'+Math.max(i,j);
        if (edgeSeen.has(key)) return; edgeSeen.add(key);
        const a = graph.vertices[i], b = graph.vertices[j];
        positions.push(a[0]*scale, a[1]*scale, a[2]*scale, b[0]*scale, b[1]*scale, b[2]*scale);
      });
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity });
    group.add(new THREE.LineSegments(geo, mat));

    const nodeGeo = new THREE.SphereGeometry(scale*0.045, 10, 10);
    const nodeMat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.3 });
    graph.vertices.forEach(v => {
      const m = new THREE.Mesh(nodeGeo, nodeMat);
      m.position.set(v[0]*scale, v[1]*scale, v[2]*scale);
      group.add(m);
    });
  }

  addGraphMesh(Nelos.GRAPH_C60, 9, 0x3ddad0, 0.5);
  addGraphMesh(Nelos.GRAPH_C20, 4.2, 0xd4af37, 0.7); // inner core, gold — the branding accent, structurally meaningful here

  let theta = 0.5, phi = 1.1, radius = 60;
  let isDragging = false, lastX = 0, lastY = 0, autoRotate = true;
  function updateCam() {
    camera.position.set(radius*Math.sin(phi)*Math.cos(theta), radius*Math.cos(phi), radius*Math.sin(phi)*Math.sin(theta));
    camera.lookAt(0,0,0);
  }
  updateCam();
  const canvas = renderer.domElement;
  canvas.addEventListener('mousedown', e => { isDragging=true; lastX=e.clientX; lastY=e.clientY; autoRotate=false; canvas.classList.add('dragging'); });
  window.addEventListener('mouseup', () => { isDragging=false; canvas.classList.remove('dragging'); setTimeout(()=>autoRotate=true, 1800); });
  window.addEventListener('mousemove', e => {
    if (!isDragging) return;
    theta -= (e.clientX-lastX)*0.008; phi = Math.max(0.2, Math.min(Math.PI-0.2, phi-(e.clientY-lastY)*0.008));
    lastX=e.clientX; lastY=e.clientY; updateCam();
  });
  canvas.addEventListener('wheel', e => { e.preventDefault(); radius = Math.max(20, Math.min(160, radius+e.deltaY*0.05)); updateCam(); }, { passive: false });

  function animate() {
    requestAnimationFrame(animate);
    if (autoRotate) { theta += 0.003; updateCam(); }
    group.rotation.x = Math.sin(performance.now()*0.0002) * 0.05;
    renderer.render(scene, camera);
  }
  animate();

  window.addEventListener('resize', () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  });
})();

// ---------------- genesis tour: real facts, progressive build-up ----------------
const TOUR_STEPS = [
  {
    title: "A single point",
    body: "Geometric computing starts here: one vertex. In NELOS, every vertex will hold one chunk of your file's data — but first, the shape.",
    stage: 'point'
  },
  {
    title: "Edges connect",
    body: "Vertices connect to exactly 3 neighbors each — no more, no less. This isn't a stylistic choice; it's what makes a closed, buckminsterfullerene-style cage possible. The full outer structure has 60 vertices and 90 edges, verified by construction, not assumed.",
    stage: 'edges'
  },
  {
    title: "Faces close the cage",
    body: "Where edges meet, faces form: 12 pentagons and 20 hexagons, 32 faces total. Every single vertex touches exactly 3 of them — that property is what makes redundancy possible: lose one node, and up to 3 different faces each hold enough information to rebuild it.",
    stage: 'faces'
  },
  {
    title: "Why the math holds",
    body: "Each face stores a simple XOR of its members' data. If exactly one member goes bad, the others plus that stored value reconstruct it exactly — verified by CRC32, not guessed. This is real erasure coding, tested on this exact structure by deliberately corrupting data and confirming byte-for-byte recovery.",
    stage: 'parity'
  },
  {
    title: "The nested core",
    body: "Inside the 60-node outer shell sits a second, independent structure: a 20-node dodecahedron (gold), protecting the vault's own manifest — the one piece of data that, if lost, would make everything else unreadable. Two independent geometries, each doing a different job.",
    stage: 'nested'
  },
  {
    title: "Honest limits",
    body: "This isn't infinite magic. The math has a real ceiling: this structure can't guarantee recovery past a certain number of simultaneous failures, because there are only 32 parity equations to work with. NELOS tells you plainly when it's past that point — it never claims a recovery it can't verify.",
    stage: 'limits'
  }
];

let tourIndex = 0;
let tourScene, tourCamera, tourRenderer, tourGroup, tourEdgesMat, tourFacesGroup, tourAnimId;

function initTourScene() {
  const stage = document.getElementById('tourStage');
  stage.innerHTML = '';
  tourScene = new THREE.Scene();
  tourCamera = new THREE.PerspectiveCamera(50, stage.clientWidth/stage.clientHeight, 0.1, 2000);
  tourCamera.position.set(0,0,50);
  tourRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  tourRenderer.setSize(stage.clientWidth, stage.clientHeight);
  stage.appendChild(tourRenderer.domElement);
  tourScene.add(new THREE.AmbientLight(0x3ddad0, 1.5));
  tourGroup = new THREE.Group();
  tourScene.add(tourGroup);

  const G = Nelos.GRAPH_C60, F = Nelos.FACES_C60;
  const scale = 9;

  // single point (first vertex)
  const pointGeo = new THREE.SphereGeometry(0.6, 12, 12);
  const pointMat = new THREE.MeshStandardMaterial({ color: 0x3ddad0, emissive: 0x3ddad0, emissiveIntensity: 0.5 });
  const singlePoint = new THREE.Mesh(pointGeo, pointMat);
  singlePoint.position.set(G.vertices[0][0]*scale, G.vertices[0][1]*scale, G.vertices[0][2]*scale);
  singlePoint.name = 'singlePoint';
  tourGroup.add(singlePoint);

  // all vertices (hidden until 'edges' step)
  const allNodes = new THREE.Group(); allNodes.name = 'allNodes'; allNodes.visible = false;
  G.vertices.forEach(v => {
    const m = new THREE.Mesh(pointGeo.clone(), pointMat.clone());
    m.scale.setScalar(0.5);
    m.position.set(v[0]*scale, v[1]*scale, v[2]*scale);
    allNodes.add(m);
  });
  tourGroup.add(allNodes);

  // edges (hidden until 'edges' step)
  const edgePositions = []; const edgeSeen = new Set();
  G.adjacency.forEach((neigh,i) => neigh.forEach(j => {
    const key = Math.min(i,j)+'_'+Math.max(i,j); if (edgeSeen.has(key)) return; edgeSeen.add(key);
    const a=G.vertices[i], b=G.vertices[j];
    edgePositions.push(a[0]*scale,a[1]*scale,a[2]*scale,b[0]*scale,b[1]*scale,b[2]*scale);
  }));
  const edgeGeo = new THREE.BufferGeometry();
  edgeGeo.setAttribute('position', new THREE.Float32BufferAttribute(edgePositions,3));
  const edgeLines = new THREE.LineSegments(edgeGeo, new THREE.LineBasicMaterial({ color: 0x3ddad0, transparent:true, opacity:0.6 }));
  edgeLines.name = 'edgeLines'; edgeLines.visible = false;
  tourGroup.add(edgeLines);

  // faces (hidden until 'faces' step) — highlight one face's 3 covering-faces for the parity step
  const facesGroup = new THREE.Group(); facesGroup.name = 'facesGroup'; facesGroup.visible = false;
  F.forEach((face, idx) => {
    const pts = face.map(i => G.vertices[i]);
    const centroid = pts.reduce((a,p)=>[a[0]+p[0],a[1]+p[1],a[2]+p[2]],[0,0,0]).map(x=>x/pts.length);
    const verts = [];
    for (let k=0;k<pts.length;k++) {
      verts.push(...centroid.map(x=>x*scale), ...pts[k].map(x=>x*scale), ...pts[(k+1)%pts.length].map(x=>x*scale));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts,3));
    const isPenta = face.length===5;
    const mat = new THREE.MeshBasicMaterial({ color: isPenta?0xd4af37:0x3ddad0, transparent:true, opacity: isPenta?0.12:0.07, side: THREE.DoubleSide, depthWrite:false });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData.faceIdx = idx;
    facesGroup.add(mesh);
  });
  tourGroup.add(facesGroup);

  // inner C20 core (hidden until 'nested' step)
  const core = new THREE.Group(); core.name = 'core'; core.visible = false;
  const G20 = Nelos.GRAPH_C20, scale20 = 4.2;
  const posC20 = []; const seenC20 = new Set();
  G20.adjacency.forEach((neigh,i)=>neigh.forEach(j=>{
    const key=Math.min(i,j)+'_'+Math.max(i,j); if(seenC20.has(key)) return; seenC20.add(key);
    const a=G20.vertices[i], b=G20.vertices[j];
    posC20.push(a[0]*scale20,a[1]*scale20,a[2]*scale20,b[0]*scale20,b[1]*scale20,b[2]*scale20);
  }));
  const geo20 = new THREE.BufferGeometry();
  geo20.setAttribute('position', new THREE.Float32BufferAttribute(posC20,3));
  core.add(new THREE.LineSegments(geo20, new THREE.LineBasicMaterial({ color:0xd4af37, transparent:true, opacity:0.85 })));
  tourGroup.add(core);

  animateTour();
}

function animateTour() {
  if (tourAnimId) cancelAnimationFrame(tourAnimId);
  function loop() {
    tourAnimId = requestAnimationFrame(loop);
    tourGroup.rotation.y += 0.004;
    tourRenderer.render(tourScene, tourCamera);
  }
  loop();
}

function applyTourStage(stage) {
  const singlePoint = tourGroup.getObjectByName('singlePoint');
  const allNodes = tourGroup.getObjectByName('allNodes');
  const edgeLines = tourGroup.getObjectByName('edgeLines');
  const facesGroup = tourGroup.getObjectByName('facesGroup');
  const core = tourGroup.getObjectByName('core');

  singlePoint.visible = stage === 'point';
  allNodes.visible = stage !== 'point';
  edgeLines.visible = stage !== 'point';
  facesGroup.visible = (stage === 'faces' || stage === 'parity' || stage === 'nested' || stage === 'limits');
  core.visible = (stage === 'nested' || stage === 'limits');

  // parity step: dim all faces except 3 covering one chosen vertex, to show the real relationship
  facesGroup.children.forEach(mesh => {
    if (stage === 'parity') {
      const covers = Nelos.FACES_C60[mesh.userData.faceIdx].includes(0);
      mesh.material.opacity = covers ? 0.35 : 0.03;
    } else {
      const isPenta = Nelos.FACES_C60[mesh.userData.faceIdx].length === 5;
      mesh.material.opacity = isPenta ? 0.12 : 0.07;
    }
  });
}

function renderTourStep() {
  const step = TOUR_STEPS[tourIndex];
  document.getElementById('tourTitle').textContent = step.title;
  document.getElementById('tourBody').textContent = step.body;
  document.querySelectorAll('.tour-dots .d').forEach((d,i) => d.classList.toggle('active', i===tourIndex));
  applyTourStage(step.stage);
  document.getElementById('tourBackBtn').disabled = tourIndex === 0;
  document.getElementById('tourNextBtn').textContent = tourIndex === TOUR_STEPS.length-1 ? 'Finish' : 'Next →';
}

function openTour() {
  document.getElementById('tourOverlay').classList.add('open');
  document.getElementById('tourDots').innerHTML = TOUR_STEPS.map((_,i)=>`<div class="d"></div>`).join('');
  tourIndex = 0;
  initTourScene();
  renderTourStep();
}
function closeTour() {
  document.getElementById('tourOverlay').classList.remove('open');
  if (tourAnimId) cancelAnimationFrame(tourAnimId);
}

document.getElementById('tourBtn').onclick = openTour;
document.getElementById('tourCloseBtn').onclick = closeTour;
document.getElementById('tourNextBtn').onclick = () => {
  if (tourIndex < TOUR_STEPS.length-1) { tourIndex++; renderTourStep(); } else { closeTour(); }
};
document.getElementById('tourBackBtn').onclick = () => { if (tourIndex>0) { tourIndex--; renderTourStep(); } };
