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
  await T('hall.exit-signs-hang-from-the-ceiling-glow-and-face-the-way-to-the-exit', async () => {
    const signs = []; g.renderer.scene.traverse((o) => { if (o.name === 'exitSign') signs.push(o); });
    const bad = []; if (signs.length < 2) bad.push('only ' + signs.length + ' exit signs');
    for (const sg of signs) {
      let top = -1, lights = 0, glowFace = false; sg.updateMatrixWorld(true);
      sg.traverse((o) => { if (o.isMesh && o.geometry.type === 'CylinderGeometry') { const b = new THREE.Box3().setFromObject(o); top = Math.max(top, b.max.y); } if (o.isPointLight) lights++; if (o.isMesh && o.material && o.material.color && o.material.color.g > 1.2 && o.material.map) glowFace = true; });
      if (!(top >= HALL_H - 0.1)) bad.push('cords stop at ' + top.toFixed(2) + ' m, ceiling is ' + HALL_H);
      if (!lights) bad.push('no light'); if (!glowFace) bad.push('face does not glow');
      const f = new THREE.Vector3(0, 0, 1).applyQuaternion(sg.quaternion); if (Math.abs(f.x) < 0.9) bad.push('sign does not face along the hall');
    }
    return bad.length === 0 || bad.join('; ');
  });
}
