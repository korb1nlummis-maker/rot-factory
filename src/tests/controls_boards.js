import * as THREE from 'three';
import { HALL_H } from '../config.js';
export default async function (ctx) {
  const { T, g } = ctx;
  await T('hall.exit-sign-is-one-octagonal-post-sign-facing-the-start-with-the-way-out', async () => {
    const signs = []; g.renderer.scene.traverse((o) => { if (o.name === 'exitSign') signs.push(o); });
    const bad = []; if (signs.length !== 1) return signs.length + ' exit signs, expected exactly one';
    const sg = signs[0]; sg.updateMatrixWorld(true); const f = new THREE.Vector3(0, 0, 1).applyQuaternion(sg.quaternion); const toStart = new THREE.Vector3(0 - sg.position.x, 0, -1.4 - sg.position.z).normalize();
    if (f.dot(toStart) < 0.95) bad.push('sign does not face the start');
    let post = false, face = false; sg.traverse((o) => { if (o.isMesh && o.geometry.type === 'CylinderGeometry' && o.geometry.parameters.height > 2) post = true; if (o.isMesh && o.geometry.type === 'CircleGeometry' && o.geometry.parameters.segments === 8) face = true; });
    if (!post) bad.push('no post'); if (!face) bad.push('face is not an octagon');
    return bad.length === 0 || bad.join('; ');
  });
}
