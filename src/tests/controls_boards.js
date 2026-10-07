import { CONTROL_CODES } from '../controls.js';
import * as THREE from 'three';
import { HALL_H } from '../config.js';
export default async function (ctx) {
  const { T, g } = ctx;
  await T('hall.controls-chalkboards-exist-fit-and-name-only-real-controls', async () => {
    const cb = g.hall.controlBoards; if (!cb || cb.length !== 2) return 'expected 2 controls boards';
    const bad = [];
    for (const [title, , , codes] of cb) { for (const c of codes) if (!CONTROL_CODES.has(c)) bad.push(`${title}: ${c} is not in CONTROLS`); const b = g.hall.boards.find((x) => x.title === title); if (!b) bad.push('board not built: ' + title); else if (b.overflow) bad.push(title + ' runs off the board'); }
    return bad.length === 0 || bad.join('; ');
  });
  await T('hall.exit-sign-is-one-octagonal-post-sign-facing-the-start-with-the-way-out', async () => {
    const signs = []; g.renderer.scene.traverse((o) => { if (o.name === 'exitSign') signs.push(o); });
    const bad = []; if (signs.length !== 1) return signs.length + ' exit signs, expected exactly one';
    const sg = signs[0]; sg.updateMatrixWorld(true); const f = new THREE.Vector3(0, 0, 1).applyQuaternion(sg.quaternion); const toStart = new THREE.Vector3(0 - sg.position.x, 0, -1.4 - sg.position.z).normalize();
    if (f.dot(toStart) < 0.95) bad.push('sign does not face the start');
    let post = false, face = false; sg.traverse((o) => { if (o.isMesh && o.geometry.type === 'CylinderGeometry' && o.geometry.parameters.height > 2) post = true; if (o.isMesh && o.geometry.type === 'CircleGeometry' && o.geometry.parameters.segments === 8) face = true; });
    if (!post) bad.push('no post'); if (!face) bad.push('face is not an octagon');
    return bad.length === 0 || bad.join('; ');
  });
  await T('hall.earth-movers-board-faces-the-plaza-and-nothing-overlaps-it', async () => {
    const b = g.hall.boards.find((x) => x.title === 'EARTH MOVERS'); if (!b) return 'no board';
    const bad = []; const cols = g.hall.colliders.filter((c) => !(Math.abs(c.x - b.x) < 0.01 && Math.abs(c.z - b.z) < 0.01) && Math.hypot(c.x - b.x, c.z - b.z) < 1.5);
    if (cols.length) bad.push('overlaps ' + cols.map((c) => `(${c.x},${c.z})`).join(' '));
    let rot = null; g.renderer.scene.traverse((o) => { if (o.name === 'chalkboard' && Math.abs(o.position.x - b.x) < 0.01 && Math.abs(o.position.z - b.z) < 0.01) rot = o; });
    if (!rot) return 'board object not found'; const f = new THREE.Vector3(0, 0, 1).applyQuaternion(rot.quaternion); if (!(f.x < -0.9)) bad.push('faces ' + f.x.toFixed(2) + ', ' + f.z.toFixed(2) + ' instead of west into the plaza');
    return bad.length === 0 || bad.join('; ');
  });
  await T('hall.fan-board-explains-direction-spacing-and-power-and-fits', async () => {
    const b = g.hall.boards.find((x) => x.title === 'HOW FANS WORK'); if (!b) return 'no fan board'; const txt = JSON.stringify(b.rows) + b.foot; const bad = [];
    if (b.overflow) bad.push('runs off the board'); for (const w of ['face deeper', 'spacing', 'No power', 'Reach 20 m', 'Vent Fan']) if (!txt.includes(w)) bad.push('missing ' + w);
    const cols = g.hall.colliders.filter((c) => Math.hypot(c.x - b.x, c.z - b.z) < 1.4 && !(Math.abs(c.x - b.x) < 0.01 && Math.abs(c.z - b.z) < 0.01)); if (cols.length) bad.push('overlaps ' + cols.map((c) => `(${c.x},${c.z})`).join(' '));
    return bad.length === 0 || bad.join('; ');
  });
}
