// Bakes the canonical 3D poppy into flat sprites once per (cause × yaw angle);
// the field then stamps those with drawImage, so the ~9,500 field instances
// are just bitmaps.

import * as THREE from "three";
import { buildPoppy, POPPY_DEFAULTS, POPPY_LIGHTING, oklchToHex, type Poppy3DParams } from "./poppy3d";

// Re-export so field/trio can keep importing the colour util from one place.
export { oklchToHex };

const DEG = Math.PI / 180;

export interface AngleSprites {
	combat: HTMLCanvasElement[]; // one per yaw angle, bright (killed in action)
	disease: HTMLCanvasElement[]; // one per yaw angle, duller (disease / flu / other)
	angles: number[]; // yaw (radians) baked at each index, ascending
}

// Reads a CSS custom property holding an oklch() or hex colour and returns hex —
// custom properties resolve to raw text, and THREE/canvas both need hex.
export function cssColorHex(name: string, fallback: string): string {
	const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
	const src = raw || fallback;
	const m = src.match(/oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/i);
	return m ? oklchToHex(parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])) : src;
}
function toRgb(hex: string): [number, number, number] {
	const h = hex.replace("#", "");
	const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
	return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)];
}
const toHex = (c: number) => Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, "0");
// In-hue underside/shadow tone: scale each sRGB channel toward black.
export function darken(hex: string, f: number): string {
	return `#${toRgb(hex).map((c) => toHex(c * f)).join("")}`;
}

// One full/muted (etc.) palette pair for a baked sprite set. Colours are hex,
// sourced from poppy-field/params.ts — the single source of truth.
export interface PoppyPalette {
	combat: string;
	disease: string;
}

// Bakes one sprite set per palette in a single renderer/scene/GL-context
// session — creating the WebGL context and compiling shaders dominates the
// bake cost, so callers wanting both the full and muted sets should pass both
// palettes here rather than calling twice.
export function bakePoppyAngleSpriteSets(
	dpr: number,
	opts: {
		angleCount?: number;
		leanMax?: number;
		cell?: number;
		frustum?: number;
	},
	palettes: PoppyPalette[],
): AngleSprites[] {
	const angleCount = opts.angleCount ?? 15;
	const leanMax = (opts.leanMax ?? 78) * DEG;
	const frustum = opts.frustum ?? 1.35; // half-extent; smaller → flower fills more of the cell
	const cell = Math.round((opts.cell ?? 120) * Math.min(dpr, 2));

	const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
	renderer.setClearColor(0x000000, 0);
	renderer.setPixelRatio(1);
	renderer.setSize(cell, cell, false);

	const scene = new THREE.Scene();
	scene.add(new THREE.AmbientLight(0xffffff, POPPY_LIGHTING.ambient));
	const key = new THREE.DirectionalLight(0xffffff, POPPY_LIGHTING.strength);
	const el = POPPY_LIGHTING.elev * DEG;
	key.position.set(0.25, Math.sin(el), Math.cos(el));
	scene.add(key);
	const under = new THREE.DirectionalLight(0xffffff, 0.12);
	under.position.set(-0.4, -0.5, 0.3);
	scene.add(under);
	const cam = new THREE.OrthographicCamera(-frustum, frustum, frustum, -frustum, 0.1, 100);
	cam.position.set(0, 0, 10);
	cam.lookAt(0, 0, 0);
	const pivot = new THREE.Group();
	const orient = new THREE.Group();
	orient.rotation.x = Math.PI / 2; // flower +Y axis → +Z (face the camera)
	pivot.add(orient);
	scene.add(pivot);

	const centre = cssColorHex("--color-poppy-centre", "oklch(0.2 0.06 30)");

	const angles = Array.from({ length: angleCount }, (_, a) => -leanMax + (2 * leanMax * a) / (angleCount - 1));

	const bakeCause = (petalColor: string, deepColor: string, petals = POPPY_DEFAULTS.petals): HTMLCanvasElement[] => {
		const params: Poppy3DParams = { ...POPPY_DEFAULTS, petals, petalColor, deepColor, centreColor: centre };
		const poppy = buildPoppy(params);
		orient.add(poppy.group);
		const out: HTMLCanvasElement[] = angles.map((yaw) => {
			pivot.rotation.set(0, yaw, 0);
			renderer.render(scene, cam);
			const c = document.createElement("canvas");
			c.width = cell;
			c.height = cell;
			c.getContext("2d")!.drawImage(renderer.domElement, 0, 0);
			return c;
		});
		orient.remove(poppy.group);
		poppy.dispose();
		return out;
	};

	const sets = palettes.map((pal) => ({
		combat: bakeCause(pal.combat, darken(pal.combat, 0.62)),
		// 4-petal: a shape encoding that stays legible even when colour alone doesn't
		// distinguish disease deaths from the bright combat blooms.
		disease: bakeCause(pal.disease, darken(pal.disease, 0.6), 4),
		angles,
	}));

	// forceContextLoss() releases the GL context eagerly (dispose() alone waits for
	// GC), so repeated bakes don't breach the browser's ~16-context cap.
	renderer.forceContextLoss();
	renderer.dispose();
	return sets;
}
