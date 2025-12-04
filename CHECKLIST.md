# Refactor Plan — Three ⇄ JSCAD ⇄ Manifold & Generators

> Goal: untangle `Preview3dComponent` and `Object-Gen-Combo.ts`, centralize conversions, and split generators into path/mesh. Keep **Geom3** as the neutral CAD shape, and perform booleans via a pluggable adapter (JSCAD by default; Manifold optional).

## 0) Prep

- [ ] Create a **new branch** for the refactor (keeping your local changes safe):

```bash
git checkout -b refactor/geometry-layering
```

- [ ] [] Ensure Angular/TS compile clean before starting:
  `npm run build`

---

## 1) Create Adapters (drop-in)

### 1.1 `data-access/cad/three.adapter.ts`

- [ ] **Add file** with the provided `ThreeAdapter` (Three ↔ STL ↔ Geom3, plus bakeWorldMatrix and optional Manifold bridge).
- [ ] Verify it exports:
  - [ ] `class ThreeAdapter`
  - [ ] `normalizeToUint8Array` (internal)
  - [ ] `debugFaceColorMaterial` (internal)

### 1.2 `data-access/cad/boolean.adapter.ts`

- [ ] **Add file** with `BooleanAdapter` supporting `engine: 'jscad' | 'manifold'`.
- [ ] Methods to expose:
  - [ ] `union(...parts: Geom3[]): Geom3`
  - [ ] `subtract(a: Geom3, b: Geom3): Geom3`
  - [ ] `intersect(...parts: Geom3[]): Geom3`
- [ ] JSCAD-only works out of the box; Manifold path requires a bridge (next step).

### 1.3 (Optional) `data-access/cad/manifold.bridge.ts`

- [ ] **Add file** exposing:
  - [ ] `makeManifoldOps(manifoldService: ManifoldWasmService): ManifoldOps`
- [ ] This wires your existing `ManifoldWasmService` into `BooleanAdapter` & `ThreeAdapter`.

---

## 2) Text Adapter (SVG → Shapes → Extrude → Geom3)

### 2.1 `data-access/cad/text.adapter.ts`

- [ ] **Add file** with `TextAdapter` using `SVGLoader` and `ThreeAdapter`.
- [ ] Methods to expose:
  - [ ] `shapesFromSvgPath(svgPath: string): THREE.Shape[]`
  - [ ] `meshesFromSvgPath(svgPath: string, opts?: ExtrudeOptions): THREE.Mesh[]`
  - [ ] `geom3FromSvgPath(svgPath: string, opts?: ExtrudeOptions): Geom3[]`
  - [ ] `charShapesFromSvgPath(svgPath: string, char: string, index: number): CharShape[]`
  - [ ] `divotBoxFromBakedMesh(mesh: THREE.Mesh, extraDepth?: number): Geom3` (optional utility)

---

## 3) Generators (pure geometry helpers)

> Keep these library-light. Returning **Geom3** is fine (use JSCAD modeling primitives inside), or define your own mesh type and adapt later. Pick one approach consistently.

### 3.1 `data-access/cad/generators.mesh.ts`

- [ ] Export functions like:
  - [ ] `boxGeom3(size: [number,number,number], center: [number,number,number]): Geom3`
  - [ ] `cylinderGeom3(r: number, h: number, center: [number,number,number]): Geom3`
  - [ ] `roundedSlotGeom3(length: number, radius: number, height: number, center: [x,y,z], axis: 'X'|'Z'): Geom3`
  - [ ] (Any other recurring primitives you saw in `Object-Gen-Combo.ts`)

### 3.2 `data-access/cad/generators.paths.ts`

- [ ] Export **2D** helpers only:
  - [ ] `circlePoint(cx, cz, r, theta): [number, number]`
  - [ ] `circlePoints(cx, cz, r, count, start?): Array<[number, number]>`
  - [ ] `roundedRectPath(width, length, radius): Array<[number, number]>`
  - [ ] (Any path placement math for text/knobs/tracks)

---

## 4) Assembly Service (feature orchestration)

> This is where you build the big pieces by composing generators + booleans + adapters.

### 4.1 `features/tracker/assembly.service.ts`

- [ ] Create a service/class exposing:
  - [ ] `buildBaseLayer1(editor: EditorData, modules: TrackerModule[]): Promise<Geom3>`
  - [ ] `buildLayer2(editor, modules): Promise<Geom3[]>`
  - [ ] `buildLayer3(editor, modules): Promise<Geom3>`
  - [ ] `buildSliderTrackLayer1(...) → Promise<Geom3>`
  - [ ] `buildSliderWindowLayer3(...) → Promise<Geom3>`
  - [ ] `buildDialBaseLayer1(...)`, `buildDialLayer2(...)`, `buildDialKnobHoleLayer3(...)`
  - [ ] `buildTextAndDivots(svgPath: string, depth: number, editor: EditorData): Promise<{ text: Geom3[]; divots: Geom3[] }>`
- [ ] Internally call:
  - [ ] **Mesh/Path generators** to create primitive Geom3s.
  - [ ] **BooleanAdapter** to `union/subtract/intersect`.
  - [ ] Convert to **Three** only back in the component (via `ThreeAdapter`).

---

## 5) Migrate `Object-Gen-Combo.ts` (SpellTracker)

- [ ] **Cut these methods** out and move where indicated:
  - [ ] `convertThreeToJSCAD` → `ThreeAdapter.geom3FromThree`
  - [ ] `convertJSCADToThree` → `ThreeAdapter.meshesFromGeom3`
  - [ ] `applyTransformationMatrix` → `ThreeAdapter.bakeWorldMatrix`
  - [ ] `addTextLayer3(meshJSON)` → NA (prefer `TextAdapter` → `Geom3`; if still needed, put into ThreeAdapter as `geom3FromThreeJSON`)
- [ ] **Re-implement** layer builders in **Assembly Service** returning `Geom3` (not `THREE.Mesh`).
- [ ] Leave a **temporary compat shim** (optional):

```TypeScript

    // utils/Object-Gen-Combo.ts (temporary)
    export { ThreeAdapter } from '@data-access/cad/three.adapter';
    export { BooleanAdapter } from '@data-access/cad/boolean.adapter';
    export { TextAdapter } from '@data-access/cad/text.adapter';
    // Re-export build methods once you wire them in assembly.service
```

- [ ] Once all callers updated, **delete** `Object-Gen-Combo.ts`.

---

## 6) Clean up `Preview3dComponent`

- [ ] **Inject/compose** the adapters/services:
      ```TypeScript
  const three = new ThreeAdapter(); // JSCAD booleans by default
  const bools = new BooleanAdapter({ three });  
  // If you want Manifold-backed booleans:
  // const maniOps = makeManifoldOps(this.manifoldService);
  // const three = new ThreeAdapter({ manifold: maniOps });
  // const bools = new BooleanAdapter({ engine: 'manifold', manifold: maniOps, three });  
  const text = new TextAdapter(three);

````

- [ ]  Replace calls:

    - [ ] `this.tracker.addBaseLayer1()` → `assembly.buildBaseLayer1(...)` ⇒ `three.meshesFromGeom3(...)` ⇒ `scene.add(...)`

    - [ ] `this.tracker.createLayer2()` → `assembly.buildLayer2(...)` ⇒ convert to Three & add

    - [ ] `this.tracker.createLayer3()` → `assembly.buildLayer3(...)` ⇒ convert to Three & add

- [ ]  Replace **text** helpers:

    - [ ] `generateTextMeshesForIntersect` → `text.meshesFromSvgPath(...)` (Three preview) **or** `text.geom3FromSvgPath(...)` (CAD pipeline)

    - [ ] `generateTextMeshJSON` / `generateTextShapes` → `text.shapesFromSvgPath(...)` or `text.geom3FromSvgPath(...)`

    - [ ] `charShapesToVec3s` → `text.charShapesFromSvgPath(...)`

- [ ]  **Remove** duplicated helpers:

    - [ ] `addMeshAndWireFrame`, `addMeshAndWireFrameThree` (use `three.meshesFromGeom3(..., { debug: true })`)

    - [ ] `convertThreeJsToManifold` (covered by bridge), `cleanTHREEMeshGeometry` (move to three.adapter if truly needed)

- [ ]  Keep UI-only stuff (controls, SSAO, Voronoi SVG) here.


---

## 7) STL Export Zip (optional centralization)

### 7.1 `data-access/cad/export.adapter.ts`

- [ ]  Add:

    ```TypeScript
import JSZip from 'jszip';
import * as THREE from 'three';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';

export async function zipSceneMeshes(scene: THREE.Scene): Promise<Blob> {
	const exporter = new STLExporter();
	const zip = new JSZip();
	const counts: Record<string, number> = {};

	scene.traverse((obj) => {
		if (!(obj instanceof THREE.Mesh)) return;
		const name = obj.name || 'mesh';
		counts[name] = (counts[name] ?? 0) + 1;
		const stl = exporter.parse(obj); // string OK for JSZip
		zip.file(`${name}.stl`, stl);
	});

	const readme = Object.entries(counts)
	.map(([name, n]) => `${name}.stl: print ${n} time(s)`)
	.join('\n');
	zip.file('README.md', readme + '\n');

	return zip.generateAsync({ type: 'blob' });
}```

- [ ]  In component: replace export logic with:

```TypeScript
import { zipSceneMeshes } from '@data-access/cad/export.adapter';
import { saveAs } from 'file-saver';
public async outputSTL() {
	const blob = await zipSceneMeshes(this.scene);
	saveAs(blob, 'my-stls.zip');
}
````

---

## 8) Rename map (old → new)

- [ ] Conversions:
  - [ ] `convertThreeToJSCAD` → `three.geom3FromThree`
  - [ ] `convertJSCADToThree` → `three.meshesFromGeom3`
  - [ ] `applyTransformationMatrix` → `three.bakeWorldMatrix`
- [ ] Booleans:
  - [ ] `booleans.union` → `bools.union`
  - [ ] `booleans.subtract` → `bools.subtract`
  - [ ] `booleans.intersect` → `bools.intersect`
- [ ] Text:
  - [ ] `generateTextMeshesForIntersect` → `text.meshesFromSvgPath`
  - [ ] `generateTextMeshJSON` → (usually not needed) or `text.meshesFromSvgPath` then `.toJSON()`
  - [ ] `generateTextShapes` → `text.shapesFromSvgPath`
  - [ ] `charShapesToVec3s` / `generateTextCharShapes` → `text.charShapesFromSvgPath`
- [ ] Generators:
  - [ ] Repeated `new THREE.BoxGeometry/CylinderGeometry` → `boxGeom3` / `cylinderGeom3`
  - [ ] Rounded windows/slots → `roundedSlotGeom3`

---

## 9) Compile checkpoints

- [ ] **Step 1** (adapters only): project compiles
- [ ] **Step 2** (move conversions out of `Object-Gen-Combo.ts` and into ThreeAdapter): compiles; component temporarily calls adapter methods directly
- [ ] **Step 3** (text.adapter wired; replace old text funcs): compiles; text preview still works
- [ ] **Step 4** (assembly service returns Geom3; component converts to Three at end): compiles and renders expected geometry
- [ ] **Step 5** (generators used instead of ad-hoc THREE primitives): compiles; same visuals
- [ ] **Step 6** delete `Object-Gen-Combo.ts` (or keep shim until all imports migrated)

---

## 10) Tests & sanity

- [ ] Unit tests (lightweight):
  - [ ] `three.adapter.spec.ts`:
    - [ ] round-trip `Geom3 → Three → Geom3` preserves triangle count (±)
  - [ ] `text.adapter.spec.ts`:
    - [ ] `geom3FromSvgPath` returns ≥1 solids for a non-empty path
  - [ ] `boolean.adapter.spec.ts`:
    - [ ] `subtract(box, cylinder)` leaves a hole where expected (bounding box assertions)
- [ ] Manual checks:
  - [ ] Scenes still show **layer1 / layer2 / layer3** with correct holes/slots.
  - [ ] STL export ZIP produces the same number of parts as before.
  - [ ] Cursor performance improved (fewer conversions per build step).

---

## 11) Commit plan (small, reviewable)

- [ ] **Commit 1**: add adapters (`three.adapter.ts`, `boolean.adapter.ts`, `text.adapter.ts`)
- [ ] **Commit 2**: migrate conversions from `Object-Gen-Combo.ts` to adapters, update imports
- [ ] **Commit 3**: introduce `assembly.service.ts`, move first layer build
- [ ] **Commit 4**: move remaining layer builds; component uses assembly
- [ ] **Commit 5**: add generators; replace ad-hoc Three primitives
- [ ] **Commit 6**: centralize STL export; delete duplicates
- [ ] **Commit 7**: remove `Object-Gen-Combo.ts` (or leave only shim), dead code cleanup

---

## 12) Optional toggles

- [ ] Switch booleans to Manifold:

```TypeScript
const maniOps = makeManifoldOps(this.manifoldService);
const three = new ThreeAdapter({ manifold: maniOps });
const bools = new BooleanAdapter({ engine: 'manifold', manifold: maniOps, three });
```

- [ ] Keep JSCAD booleans (default) while refactoring; flip later if/when you want speed.

---

## 13) Post-refactor TODOs

- [ ] Add a tiny **types** module (Vec2/Path2/Polygon2/MeshData) if you later decouple from JSCAD.
- [ ] Consider caching STL conversions in adapters if perf becomes an issue.
- [ ] Migrate Voronoi logic to a worker once geometry is isolated.
