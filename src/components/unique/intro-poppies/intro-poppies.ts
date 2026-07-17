// Five poppies for the top of the essay: three big canonical blooms in a row plus
// two small accent blooms nestled in the gaps, each rendered at its own tilt/scale
// and baked once to a canvas. Coloured with the field's "killed in action" (combat)
// OKLCH so they match the field exactly. On-page positions come from the .astro CSS.

import * as THREE from "three";
import { buildPoppy, POPPY_DEFAULTS } from "../poppy-field/poppy3d";
import { oklchToHex, darken, cssColorHex } from "../poppy-field/poppy-3d-sprites";
import { DEFAULTS as FIELD } from "../poppy-field/params";

const DEG = Math.PI / 180;

// Geometry + lighting for these blooms only — POPPY_DEFAULTS / POPPY_LIGHTING drive
// the field's canonical poppy and stay untouched. Tuned and locked in.
const INTRO_SHAPE = {
	petals: 5,
	whorls: 1,
	petalLength: 1,
	petalWidth: 1.15,
	cupLong: 0.32,
	cupTrans: 0.46,
	openInner: 1.02,
	openOuter: 1.28,
	crumple: 0.26,
	centreSize: 0.37,
	centreDepth: 0.15,
};
const INTRO_LIGHTING = { elev: 36, strength: 2, ambient: 1.2 };

// Per-canvas pose. Indices 0–2 are the big row; 3/4 are the accent blooms in the
// gaps, tipped back (negative pitch) to angle upward.
interface Pose {
	yaw: number;
	pitch: number;
	scale: number;
}
const POSES: Pose[] = [
	{ yaw: -34, pitch: -5, scale: 0.94 },
	{ yaw: 0, pitch: 1, scale: 1 },
	{ yaw: 37, pitch: 0, scale: 0.92 },
	{ yaw: -5, pitch: -50, scale: 1.24 },
	{ yaw: 5, pitch: -50, scale: 1.24 },
];

export function initIntroPoppies(root: HTMLElement) {
	const canvases = Array.from(root.querySelectorAll<HTMLCanvasElement>("canvas.intro-poppies__flower"));
	if (!canvases.length) return;
	const dpr = Math.min(window.devicePixelRatio || 1, 2);

	const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
	renderer.setClearColor(0x000000, 0);
	renderer.setPixelRatio(1);

	const scene = new THREE.Scene();
	scene.add(new THREE.AmbientLight(0xffffff, INTRO_LIGHTING.ambient));
	const key = new THREE.DirectionalLight(0xffffff, INTRO_LIGHTING.strength);
	const el = INTRO_LIGHTING.elev * DEG;
	key.position.set(0.25, Math.sin(el), Math.cos(el));
	scene.add(key);
	const under = new THREE.DirectionalLight(0xffffff, 0.12);
	under.position.set(-0.4, -0.5, 0.3);
	scene.add(under);

	const frustum = 1.25;
	const cam = new THREE.OrthographicCamera(-frustum, frustum, frustum, -frustum, 0.1, 100);
	cam.position.set(0, 0, 10);
	cam.lookAt(0, 0, 0);
	const pivot = new THREE.Group();
	const orient = new THREE.Group();
	orient.rotation.x = Math.PI / 2;
	pivot.add(orient);
	scene.add(pivot);

	// Match the field's "killed in action" (combat) poppies exactly: same combat
	// OKLCH petal, same darken(0.62) underside, same centre.
	const battle = oklchToHex(FIELD.combatL, FIELD.combatC, FIELD.combatH);
	const poppy = buildPoppy({
		...POPPY_DEFAULTS,
		...INTRO_SHAPE,
		petalColor: battle,
		deepColor: darken(battle, 0.62),
		centreColor: cssColorHex("--color-poppy-centre", "oklch(0.2 0.06 30)"),
	});
	orient.add(poppy.group);

	// Bake each canvas at its own pose.
	canvases.forEach((cv, i) => {
		const pose = POSES[i % POSES.length];
		const size = Math.max(1, Math.round((cv.clientWidth || 280) * dpr));
		renderer.setSize(size, size, false);
		cam.zoom = pose.scale;
		cam.updateProjectionMatrix();
		pivot.rotation.set(pose.pitch * DEG, pose.yaw * DEG, 0);
		renderer.render(scene, cam);
		cv.width = size;
		cv.height = size;
		cv.getContext("2d")!.drawImage(renderer.domElement, 0, 0);
	});

	// One-time bake — free the GPU context.
	poppy.dispose();
	renderer.dispose();
}
