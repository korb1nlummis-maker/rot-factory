// World geometry. One lattice cell holds one plush.
export const C = 0.6;            // cell size, meters
export const NX = 10240, NZ = 10240, NY = 72; // ~6.1 km x 6.1 km x 43.2 m hall, generated lazily
export const CS = 16;            // render chunk size in cells
export const CX = Math.ceil(NX / CS), CZ = Math.ceil(NZ / CS), CY = Math.ceil(NY / CS);
export const NA_ARCH = 16; // plush archetypes + the one + bulkhead
export const HALL_HX = NX * C * 0.5; // 72
export const HALL_HZ = NZ * C * 0.5;
export const HALL_H = NY * C;        // 43.2
export const RC = 0.335;             // collision radius of a lattice plush
export const EXIT_X = HALL_HX;       // exit door in the +X wall at z = 0
export const START = { x: 0, z: 0 };
export const SAVE_KEY = 'rotfactory.save.v1';

export const idx = (i, j, k) => (j * NZ + k) * NX + i;
export const cellX = (i) => (i + 0.5 - NX / 2) * C;
export const cellY = (j) => (j + 0.5) * C;
export const cellZ = (k) => (k + 0.5 - NZ / 2) * C;
export const toI = (x) => Math.floor(x / C + NX / 2);
export const toJ = (y) => Math.floor(y / C);
export const toK = (z) => Math.floor(z / C + NZ / 2);

export const QUALITY = {
  ultra:  { pr: 2,    renderR: 38, hiR: 12, bloom: 0.55, msaa: 4, ca: 1 },
  high:   { pr: 1.25, renderR: 30, hiR: 8,  bloom: 0.45, msaa: 0, ca: 1 },
  medium: { pr: 1,    renderR: 24, hiR: 5,  bloom: 0.35, msaa: 0, ca: 0 },
  low:    { pr: 0.7,  renderR: 18, hiR: 3,  bloom: 0,    msaa: 0, ca: 0 },
};
