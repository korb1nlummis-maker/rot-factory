// A small ducted fan that clamps under a frame's top beam and blows the way you were facing when you hung it.
import * as THREE from 'three';
const steel = new THREE.MeshStandardMaterial({ color: 0x59636e, roughness: 0.4, metalness: 0.85 });
const dark = new THREE.MeshStandardMaterial({ color: 0x1d2024, roughness: 0.6, metalness: 0.6 });
const yellow = new THREE.MeshStandardMaterial({ color: 0xe8b81c, roughness: 0.5, metalness: 0.35 });
export const MOUNT_FAN = { reach: 20, drop: 0.3 };   // small and high: the lowest point is about 1.93 m above the floor, over a standing player's head   // metres it blows, and how far below the top of the frame it hangs

// local +z is the way the air goes
export function buildMountFan() {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.025, 8, 20), steel);
  const blades = new THREE.Group(); blades.name = 'blades';
  for (let b = 0; b < 5; b++) { const bl = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.04, 0.01), yellow); bl.position.set(0.07, 0, 0); bl.rotation.z = 0.35; const gp = new THREE.Group(); gp.rotation.z = (b / 5) * Math.PI * 2; gp.add(bl); blades.add(gp); }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.1, 10), dark); hub.rotation.x = Math.PI / 2;
  const cowl = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.12, 20, 1, true), dark); cowl.rotation.x = Math.PI / 2; cowl.material = new THREE.MeshStandardMaterial({ color: 0x1d2024, roughness: 0.6, metalness: 0.6, side: THREE.DoubleSide });
  const clamp = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 0.1), steel); clamp.position.y = 0.2;
  g.add(ring, blades, hub, cowl, clamp);
  return g;
}
