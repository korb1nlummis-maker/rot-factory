// A small ducted fan that clamps under a frame's top beam and blows the way you were facing when you hung it.
import * as THREE from 'three';
const steel = new THREE.MeshStandardMaterial({ color: 0x59636e, roughness: 0.4, metalness: 0.85 });
const dark = new THREE.MeshStandardMaterial({ color: 0x1d2024, roughness: 0.6, metalness: 0.6 });
const yellow = new THREE.MeshStandardMaterial({ color: 0xe8b81c, roughness: 0.5, metalness: 0.35 });
export const MOUNT_FAN = { reach: 20, drop: 0.42 };   // metres it blows, and how far below the top of the frame it hangs

// local +z is the way the air goes
export function buildMountFan() {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.035, 8, 22), steel);
  const blades = new THREE.Group(); blades.name = 'blades';
  for (let b = 0; b < 5; b++) { const bl = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.05, 0.012), yellow); bl.position.set(0.1, 0, 0); bl.rotation.z = 0.35; const gp = new THREE.Group(); gp.rotation.z = (b / 5) * Math.PI * 2; gp.add(bl); blades.add(gp); }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.12, 10), dark); hub.rotation.x = Math.PI / 2;
  const cowl = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.16, 20, 1, true), dark); cowl.rotation.x = Math.PI / 2; cowl.material = new THREE.MeshStandardMaterial({ color: 0x1d2024, roughness: 0.6, metalness: 0.6, side: THREE.DoubleSide });
  const clamp = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.22, 0.12), steel); clamp.position.y = 0.3;
  g.add(ring, blades, hub, cowl, clamp);
  return g;
}
