// The look of a merger, a priority merger, a smart and a programmable splitter (Satisfactory spec 4.2, wave 2B). Each is a flat plate on the belt tile with colored
// cones on its sides: a splitter shows one cone per output (the color of that output's rule, small pips for more rules), a merger shows its three inputs
// (a priority merger colors them by rank). No game imports: logistics.js calls these with the entity and takes the group.
import * as THREE from 'three';
import { ruleColor, isPerm } from './splitrules.js';

const std = (hex, r = 0.5, m = 0.35) => new THREE.MeshStandardMaterial({ color: hex, roughness: r, metalness: m });
const PLATE = { merger: std(0x2fd6a6), pmerger: std(0xe8742a), ssplit: std(0x2a9de0), psplit: std(0x8a55e0) };
const DARK = std(0x1d2024, 0.6, 0.6);
const glows = new Map();
export const glow = (hex) => { let m = glows.get(hex); if (!m) { m = new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(2.6) }); glows.set(hex, m); } return m; };
export const LAMP_ON = 0x66ff99, LAMP_OFF = 0xff5a3c;

// a cone lying flat, pointing along +Z, moved to (x, z) and turned by `yaw` about the tile's up axis (model +Z is forward, model +X is the belt's left)
export const ARROW_Y = 0.24, ARROW_R = 0.22;   // height of the cones above the tile and how far from the middle (the geometry test reads them)
function arrow(hex, x, z, yaw, size = 0.095) {
  const pivot = new THREE.Group(); pivot.position.set(x, ARROW_Y, z); pivot.rotation.y = yaw;
  const cone = new THREE.Mesh(new THREE.ConeGeometry(size, size * 2.3, 4), glow(hex)); cone.rotation.x = Math.PI / 2; pivot.add(cone);
  return pivot;
}

// the output slots in model space: forward +Z, right -X, left +X (the same order as SLOT_NAMES and splitOuts)
const R0 = 0.22;
const OUT = [{ x: 0, z: R0, yaw: 0 }, { x: -R0, z: 0, yaw: -Math.PI / 2 }, { x: R0, z: 0, yaw: Math.PI / 2 }];
// the input lanes: back, left, right (a plush comes in over the edge and the cone points at the middle)
const IN = [{ x: 0, z: -R0, yaw: 0 }, { x: R0, z: 0, yaw: -Math.PI / 2 }, { x: -R0, z: 0, yaw: Math.PI / 2 }];
const RANK = [0x66ff99, 0xffd24a, 0xff5a4a];

export function partGroup(ent) {
  const g = new THREE.Group();
  const kind = ent.merger ? (ent.merger === 'prio' ? 'pmerger' : 'merger') : ent.smart === 2 ? 'psplit' : 'ssplit';
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.07, 0.58), PLATE[kind]); plate.position.y = 0.1; g.add(plate);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.1, 14), DARK); hub.position.y = 0.17; g.add(hub);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), glow(LAMP_OFF)); lamp.position.set(0.22, 0.2, -0.22); lamp.name = 'lamp'; g.add(lamp);
  if (ent.merger) {
    const prio = ent.merger === 'prio', lanes = isPerm(ent.lanes) ? ent.lanes : [0, 1, 2];
    for (let s = 0; s < 3; s++) { const a = IN[s]; g.add(arrow(prio ? RANK[lanes.indexOf(s)] : LAMP_ON, a.x, a.z, a.yaw)); }
    g.add(arrow(0xffffff, 0, R0, 0, 0.07));   // the one way out
    return g;
  }
  const rules = Array.isArray(ent.rules) && ent.rules.length === 3 ? ent.rules : [[{ k: 'any' }], [{ k: 'any' }], [{ k: 'any' }]];
  for (let s = 0; s < 3; s++) {
    const o = OUT[s], list = rules[s] || [], first = list[0];
    g.add(arrow(first ? ruleColor(first) : 0x4a4f55, o.x, o.z, o.yaw));
    // one pip above the cone for each further rule (up to seven), so a busy output reads at a glance
    for (let q = 1; q < Math.min(list.length, 8); q++) { const pip = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 5), glow(ruleColor(list[q]))); pip.position.set(o.x + (q % 2 ? 0.06 : -0.06), 0.34 + Math.floor((q - 1) / 2) * 0.05, o.z); g.add(pip); }
  }
  if (ent.mode === 'prio') { const bar = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.02, 0.03), glow(0xffd24a)); bar.position.set(0, 0.26, -0.2); g.add(bar); }   // a bar at the back: it fills in priority order
  return g;
}
