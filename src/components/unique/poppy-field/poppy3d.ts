// A parametric 3D poppy built from Three.js primitives. One flower is modelled as
// interleaved whorls of cupped petal surfaces around a small dark centre dome,
// then baked to a sprite sheet of yaw angles for the field, or rendered live for
// the opening trio. A real z-buffer handles all the occlusion we were fighting by
// hand: near petals cover the centre, the centre stays contained, no gaps.

import * as THREE from "three";

// OKLCH → sRGB hex (Björn Ottosson's oklab matrices). THREE.Color can't parse
// oklch(), so every poppy colour is converted to hex through here. This is the
// base colour util the field/trio/palette all funnel through — no hex literals.
export function oklchToHex(L: number, C: number, H: number): string {
	const hr = (H * Math.PI) / 180;
	const a = C * Math.cos(hr);
	const b = C * Math.sin(hr);
	const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
	const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
	const s_ = L - 0.0894841775 * a - 1.291485548 * b;
	const l = l_ ** 3;
	const m = m_ ** 3;
	const s = s_ ** 3;
	const lin = [
		4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
		-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
		-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
	];
	const toHex = (c: number) => Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, "0");
	const gamma = (c: number) => {
		const v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
		return Math.round(Math.max(0, Math.min(1, v)) * 255);
	};
	return `#${lin.map((c) => toHex(gamma(c))).join("")}`;
}

export interface Poppy3DParams {
	petals: number; // petals per whorl
	whorls: number; // 1 or 2 (2 = interleaved for a fuller, gapless bloom)
	petalLength: number; // petal length in world units
	petalWidth: number; // 0.4 slim … 1.6 broad/overlapping
	cupLong: number; // longitudinal curl — tip lifts (bowl depth front-to-back)
	cupTrans: number; // transverse fold — petal edges lift (the "taco" that makes a cup)
	openInner: number; // lean of inner-whorl petals from the axis (radians)
	openOuter: number; // lean of outer-whorl petals (usually a touch more open)
	crumple: number; // tissue-paper wrinkle amplitude
	centreSize: number; // dark centre radius (world units)
	centreDepth: number; // how far the centre sinks below the petal attachment plane
	petalColor: string;
	deepColor: string;
	centreColor: string;
}

// Canonical top-down lighting shared by the field bake and the trio so every
// poppy is lit identically. Baked once → free at runtime.
export const POPPY_LIGHTING = { elev: 47, strength: 1.7, ambient: 1.2 };

export const POPPY_DEFAULTS: Poppy3DParams = {
	petals: 5,
	whorls: 1,
	petalLength: 1,
	petalWidth: 1.15,
	cupLong: 0.5,
	cupTrans: 0.34,
	openInner: 1.02,
	openOuter: 1.27,
	crumple: 0.2,
	centreSize: 0.36,
	centreDepth: 0.17, // + = raised toward the viewer, − = sunk into the cup
	// Nominal fallback colours (the field/trio always override these). Same OKLCH
	// palette as global.css: combat, disease, dark seed centre.
	petalColor: oklchToHex(0.66, 0.22, 29),
	deepColor: oklchToHex(0.5, 0.195, 26),
	centreColor: oklchToHex(0.2, 0.06, 30),
};

// Broad fan-shaped width profile: ~0 at the base, swelling past the middle, with
// a rounded (not pointed) tip — the corn-poppy petal silhouette.
function widthAt(u: number): number {
	return Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.04)), 0.5);
}

// One cupped petal as a displaced grid, pointing +Y (base at origin), width along
// X, cup bulging in +Z. Longitudinal + transverse curvature make it a bowl wall.
function makePetalGeometry(p: Poppy3DParams): THREE.BufferGeometry {
	const NU = 16;
	const NV = 12;
	const L = p.petalLength;
	const pos: number[] = [];
	const idx: number[] = [];
	for (let i = 0; i <= NU; i++) {
		const u = i / NU;
		const halfW = 0.5 * p.petalWidth * L * widthAt(u);
		for (let j = 0; j <= NV; j++) {
			const vv = (j / NV) * 2 - 1; // -1 … 1 across the petal
			const x = vv * halfW;
			const y = u * L;
			const zLong = p.cupLong * L * (u * u); // tip curls toward +Z
			const zTrans = p.cupTrans * halfW * (vv * vv); // edges lift → cup
			const wrinkle = p.crumple * L * 0.03 * Math.sin(u * 9 + vv * 5) * u;
			pos.push(x, y, zLong + zTrans + wrinkle);
		}
	}
	const row = NV + 1;
	for (let i = 0; i < NU; i++) {
		for (let j = 0; j < NV; j++) {
			const a = i * row + j;
			const b = a + 1;
			const c = a + row;
			const d = c + 1;
			idx.push(a, c, b, b, c, d);
		}
	}
	const geo = new THREE.BufferGeometry();
	geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
	geo.setIndex(idx);
	geo.computeVertexNormals();
	return geo;
}

// Dark centre as a lathed dome (the ovary/stamen boss). A rounded hemisphere that
// reads as a dark circle top-down and bulges toward the viewer as the flower
// tilts. Lathed from a quarter-ellipse profile so it stays smooth.
function makeCentreGeometry(p: Poppy3DParams): THREE.BufferGeometry {
	const cr = p.centreSize * p.petalLength;
	const domeH = cr * 0.62; // dome height relative to radius
	const profile: THREE.Vector2[] = [];
	const N = 12;
	for (let k = 0; k <= N; k++) {
		const t = k / N; // 0 = top centre … 1 = rim
		profile.push(new THREE.Vector2(Math.sin((t * Math.PI) / 2) * cr, Math.cos((t * Math.PI) / 2) * domeH));
	}
	return new THREE.LatheGeometry(profile, 40);
}

export interface PoppyMeshes {
	group: THREE.Group;
	dispose: () => void;
}

// Assemble the flower. The group's local axis is +Y; the caller orients / spins it.
export function buildPoppy(p: Poppy3DParams): PoppyMeshes {
	const group = new THREE.Group();
	const petalMat = new THREE.MeshStandardMaterial({
		color: new THREE.Color(p.petalColor),
		side: THREE.DoubleSide,
		roughness: 0.72,
		metalness: 0,
	});
	const centreMat = new THREE.MeshStandardMaterial({
		color: new THREE.Color(p.centreColor),
		side: THREE.DoubleSide,
		roughness: 0.85,
		metalness: 0,
	});

	const petalGeo = makePetalGeometry(p);
	const disposables: { dispose: () => void }[] = [petalGeo, petalMat, centreMat];

	for (let w = 0; w < Math.max(1, p.whorls); w++) {
		const open = w === 0 ? p.openInner : p.openOuter;
		const offset = w * (Math.PI / p.petals); // half-step interleave for the outer whorl
		const scale = w === 0 ? 1 : 1.12; // outer whorl a touch larger
		for (let k = 0; k < p.petals; k++) {
			const slot = new THREE.Group();
			slot.rotation.y = offset + k * ((Math.PI * 2) / p.petals);
			const mesh = new THREE.Mesh(petalGeo, petalMat);
			mesh.rotation.x = open; // lean the petal outward from the axis
			mesh.scale.setScalar(scale);
			slot.add(mesh);
			group.add(slot);
		}
	}

	const centreGeo = makeCentreGeometry(p);
	disposables.push(centreGeo);
	const centre = new THREE.Mesh(centreGeo, centreMat);
	centre.position.y = p.centreDepth * p.petalLength; // + toward viewer, − sunk
	group.add(centre);

	return {
		group,
		dispose: () => disposables.forEach((d) => d.dispose()),
	};
}
