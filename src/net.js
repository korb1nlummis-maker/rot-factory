import * as THREE from 'three';
import { Peer } from 'peerjs';

// ---------------------------------------------------------------------------------------------
// Co-op over WebRTC with no server: one player hosts and sends a code, the other pastes it and sends
// a reply code back. After that the two browsers talk directly. (Uses a public STUN server to find
// each other through home routers.)
// ---------------------------------------------------------------------------------------------
const ICE = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' },
    // free public relay as a fallback for strict routers (shared, best effort)
    { urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443?transport=tcp'], username: 'openrelayproject', credential: 'openrelayproject' },
  ],
};

const enc = (obj) => btoa(unescape(encodeURIComponent(JSON.stringify(obj))));
const dec = (s) => JSON.parse(decodeURIComponent(escape(atob(s.trim()))));

function gathered(pc) {
  return new Promise((res) => {
    if (pc.iceGatheringState === 'complete') return res();
    const t = setTimeout(res, 5000);
    pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); res(); } });
  });
}

export class Net {
  constructor() {
    this.pc = null; this.dc = null;
    this.open = false;
    this.role = null;
    this.onMessage = () => {};
    this.onOpen = () => {};
    this.onClose = () => {};
  }

  setup(pc) {
    pc.addEventListener('connectionstatechange', () => {
      if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) { if (this.open) { this.open = false; this.onClose(); } }
    });
  }

  bind(dc) {
    this.dc = dc;
    dc.binaryType = 'arraybuffer';
    dc.onopen = () => { this.open = true; this.onOpen(); };
    dc.onclose = () => { if (this.open) { this.open = false; this.onClose(); } };
    dc.onmessage = (e) => { try { this.onMessage(JSON.parse(e.data)); } catch (err) { console.warn('bad net message', err); } };
  }

  async host() {
    this.role = 'host';
    const pc = this.pc = new RTCPeerConnection(ICE);
    this.setup(pc);
    this.bind(pc.createDataChannel('rot', { ordered: true }));
    await pc.setLocalDescription(await pc.createOffer());
    await gathered(pc);
    return enc({ sdp: pc.localDescription.sdp, type: pc.localDescription.type });
  }

  async finishHost(answerCode) {
    await this.pc.setRemoteDescription(dec(answerCode));
  }

  async join(offerCode) {
    this.role = 'guest';
    const pc = this.pc = new RTCPeerConnection(ICE);
    this.setup(pc);
    pc.addEventListener('datachannel', (e) => this.bind(e.channel));
    await pc.setRemoteDescription(dec(offerCode));
    await pc.setLocalDescription(await pc.createAnswer());
    await gathered(pc);
    return enc({ sdp: pc.localDescription.sdp, type: pc.localDescription.type });
  }

  // short codes: a 4 digit number through the free PeerJS broker (only used to meet, then it is direct)
  wrapConn(conn) {
    const dc = {
      readyState: 'connecting', binaryType: 'arraybuffer', onopen: null, onclose: null, onmessage: null,
      send: (str) => conn.send(str), close: () => { try { conn.close(); } catch (e) { /* ignore */ } },
    };
    conn.on('open', () => { dc.readyState = 'open'; if (dc.onopen) dc.onopen(); });
    conn.on('data', (d) => { if (dc.onmessage) dc.onmessage({ data: typeof d === 'string' ? d : new TextDecoder().decode(d) }); });
    conn.on('close', () => { dc.readyState = 'closed'; if (dc.onclose) dc.onclose(); });
    conn.on('error', () => { dc.readyState = 'closed'; if (dc.onclose) dc.onclose(); });
    this.bind(dc);
  }

  hostShort() {
    this.role = 'host';
    return new Promise((resolve, reject) => {
      let tries = 0;
      const attempt = () => {
        const code = String(1000 + Math.floor(Math.random() * 9000));
        const peer = new Peer('rotfactory-' + code);
        let done = false;
        peer.on('open', () => { done = true; this.peer = peer; this.code = code; resolve(code); });
        peer.on('connection', (conn) => { if (this.open) { conn.close(); return; } this.wrapConn(conn); });
        peer.on('error', (e) => {
          if (done) return;
          try { peer.destroy(); } catch (x) { /* ignore */ }
          if (e && e.type === 'unavailable-id' && ++tries < 6) attempt(); else reject(new Error(e && e.type === 'network' ? 'could not reach the matchmaking service' : (e && e.type) || 'failed'));
        });
      };
      attempt();
    });
  }

  joinShort(code) {
    this.role = 'guest';
    return new Promise((resolve, reject) => {
      const peer = new Peer();
      this.peer = peer;
      const to = setTimeout(() => { try { peer.destroy(); } catch (x) { /* ignore */ } reject(new Error('no answer. Check the code, and that your friend is hosting.')); }, 15000);
      peer.on('open', () => {
        const conn = peer.connect('rotfactory-' + String(code).trim(), { serialization: 'none', reliable: true });
        this.wrapConn(conn);
        conn.on('open', () => { clearTimeout(to); resolve(); });
      });
      peer.on('error', (e) => { clearTimeout(to); reject(new Error(e && e.type === 'peer-unavailable' ? 'no game with that code' : (e && e.type) || 'failed')); });
    });
  }

  send(obj) {
    if (!this.open || !this.dc || this.dc.readyState !== 'open') return false;
    try { this.dc.send(JSON.stringify(obj)); return true; } catch (e) { return false; }
  }

  close() { try { if (this.peer) this.peer.destroy(); if (this.dc) this.dc.close(); if (this.pc) this.pc.close(); } catch (e) { /* ignore */ } this.open = false; }
}

// the other person, as seen in your world
export class RemotePlayer {
  constructor(scene, name) {
    this.name = name || 'Friend';
    this.group = new THREE.Group();
    scene.add(this.group);
    const suit = new THREE.MeshStandardMaterial({ color: 0xe8863a, roughness: 0.7 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x23272b, roughness: 0.6, metalness: 0.4 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.7, 6, 12), suit); body.position.y = 0.85;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 12), new THREE.MeshStandardMaterial({ color: 0xf0c9a4, roughness: 0.8 })); head.position.y = 1.5;
    const hat = new THREE.Mesh(new THREE.SphereGeometry(0.19, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xffd23c, roughness: 0.4 })); hat.position.y = 1.54;
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.025, 16), new THREE.MeshStandardMaterial({ color: 0xffd23c, roughness: 0.4 })); brim.position.y = 1.54;
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 3.4, 2) })); lamp.position.set(0, 1.6, 0.18); lamp.name = 'lamp';
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.4, 0.14), dark); pack.position.set(0, 0.95, -0.24);
    for (const s of [-1, 1]) { const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.4, 4, 8), dark); leg.position.set(s * 0.1, 0.25, 0); leg.name = 'leg'; this.group.add(leg); }
    this.group.add(body, head, hat, brim, lamp, pack);
    // name tag
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64;
    const g = cv.getContext('2d');
    g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(0, 8, 256, 48);
    g.fillStyle = '#fff'; g.font = '700 30px Helvetica, Arial'; g.textAlign = 'center'; g.fillText(this.name, 128, 44);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    this.tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    this.tag.scale.set(1.2, 0.3, 1); this.tag.position.y = 2.05; this.tag.renderOrder = 20;
    this.group.add(this.tag);
    // a soft pulsing light above their head, seen through the pile from any distance so you always know where your partner is
    const bc = document.createElement('canvas'); bc.width = bc.height = 64; const bg = bc.getContext('2d');
    const grad = bg.createRadialGradient(32, 32, 0, 32, 32, 32); grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.25, 'rgba(120,255,235,0.85)'); grad.addColorStop(1, 'rgba(60,200,255,0)');
    bg.fillStyle = grad; bg.fillRect(0, 0, 64, 64);
    const btex = new THREE.CanvasTexture(bc); btex.colorSpace = THREE.SRGBColorSpace;
    this.beacon = new THREE.Sprite(new THREE.SpriteMaterial({ map: btex, depthTest: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending, sizeAttenuation: false }));
    this.beacon.name = 'partnerBeacon'; this.beacon.position.y = 2.45; this.beacon.renderOrder = 21; this.beacon.scale.set(0.05, 0.05, 1);
    this.group.add(this.beacon);
    this.pos = new THREE.Vector3(0, -50, 0);
    this.target = new THREE.Vector3(0, -50, 0);
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.targetYaw = 0; this.pitch = 0;
    this.lampOn = true;
    this.t = 0;
  }

  set(msg) {
    // the other player's velocity, from how far it moved since the last message: plush hit them at the right relative speed
    const now = performance.now();
    if (this._lastSet !== undefined && now - this._lastSet > 20) { const dt = Math.min(0.5, (now - this._lastSet) / 1000); this.vel.set((msg.x - this.target.x) / dt, (msg.y - this.target.y) / dt, (msg.z - this.target.z) / dt); }
    this._lastSet = now;
    this.target.set(msg.x, msg.y, msg.z); this.targetYaw = msg.yaw; this.pitch = msg.pitch; this.lampOn = msg.lamp !== false; this.fresh = performance.now(); }

  update(dt) {
    this.pos.lerp(this.target, Math.min(1, dt * 12));
    let d = ((this.targetYaw - this.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    this.yaw += d * Math.min(1, dt * 12);
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.yaw;
    const moving = this.pos.distanceTo(this.target) > 0.02;
    this.t += dt * (moving ? 9 : 0);
    this.group.children.forEach((c) => { if (c.name === 'leg') c.rotation.x = Math.sin(this.t + c.position.x * 20) * 0.6; });
    const lamp = this.group.getObjectByName('lamp'); if (lamp) lamp.visible = this.lampOn;
    // the beacon breathes about once every 1.6 s
    this.bt = (this.bt || 0) + dt; const pu = 0.5 + 0.5 * Math.sin(this.bt * 3.9);
    if (this.beacon) { const sz = 0.034 + 0.03 * pu; this.beacon.scale.set(sz, sz, 1); this.beacon.material.opacity = 0.45 + 0.55 * pu; }
  }

  spheres() { const p = this.pos, v = this.vel, r = true; return [{ x: p.x, y: p.y + 0.3, z: p.z, r: 0.3, vel: v, remote: r }, { x: p.x, y: p.y + 0.8, z: p.z, r: 0.3, vel: v, remote: r }, { x: p.x, y: p.y + 1.3, z: p.z, r: 0.3, vel: v, remote: r }]; }

  dispose(scene) { scene.remove(this.group); this.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
}
