/**
 * 2 Many Notes, Update 2 phase C (development only): finds things that stick
 * into each other. For every two meshes of different things whose boxes
 * overlap, corners of one are tested against the other: a point is inside a
 * closed shape when a ray from it crosses the surface an odd number of times.
 * The points are pulled 3 mm towards their own middle first, so things that
 * merely touch (a mug standing on the desk) do not count.
 */
import * as THREE from 'three';

interface Item {
  mesh: THREE.Mesh;
  owner: string;
  box: THREE.Box3;
  closed: boolean;
}

/** Shapes that enclose a volume (so "inside" means something). */
function isClosed(g: THREE.BufferGeometry) {
  const p = (g as THREE.BufferGeometry & { parameters?: Record<string, unknown> }).parameters ?? {};
  switch (g.type) {
    case 'BoxGeometry':
    case 'RoundedBoxGeometry':
    case 'ExtrudeGeometry':
    case 'IcosahedronGeometry':
      return true;
    case 'SphereGeometry':
      return (p.phiLength as number) >= Math.PI * 2 - 1e-3 && (p.thetaLength as number) >= Math.PI - 1e-3;
    case 'CylinderGeometry':
      return !p.openEnded && (p.thetaLength as number) >= Math.PI * 2 - 1e-3;
    case 'TorusGeometry':
      return (p.arc as number) >= Math.PI * 2 - 1e-3;
    case 'LatheGeometry': {
      const pts = p.points as THREE.Vector2[];
      return pts[0].x === 0 && pts[pts.length - 1].x === 0;
    }
    default:
      return false;
  }
}

function ownerOf(o: THREE.Object3D, scene: THREE.Scene) {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) {
    if (p.userData.id) return String(p.userData.id);
    if (p.parent === scene) {
      const v = new THREE.Vector3();
      p.getWorldPosition(v);
      return `${p.type === 'Group' ? 'group' : (p as THREE.Mesh).geometry?.type.replace('Geometry', '')}@${v.x.toFixed(2)},${v.y.toFixed(2)},${v.z.toFixed(2)}`;
    }
  }
  return 'scene';
}

export function findOverlaps(scene: THREE.Scene, skip: (o: THREE.Object3D) => boolean) {
  scene.updateMatrixWorld(true);
  const items: Item[] = [];
  scene.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || o instanceof THREE.InstancedMesh || skip(o)) return;
    for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) return;
    const mats = ([] as THREE.Material[]).concat(o.material);
    if (mats.every((m) => m.visible === false || (m.transparent && m.opacity < 0.05))) return;
    o.geometry.computeBoundingBox();
    items.push({ mesh: o, owner: ownerOf(o, scene), box: o.geometry.boundingBox!.clone().applyMatrix4(o.matrixWorld), closed: isClosed(o.geometry) });
  });
  const ray = new THREE.Raycaster();
  const dir = new THREE.Vector3(0.31, 0.83, 0.47).normalize();
  const shrunk = new THREE.Box3();
  const found = new Map<string, { a: string; b: string; points: number; of: number; where: string }>();
  const inside = (pt: THREE.Vector3, b: Item) => {
    ray.set(pt, dir);
    const mats = ([] as THREE.Material[]).concat(b.mesh.material);
    const sides = mats.map((m) => m.side);
    mats.forEach((m) => (m.side = THREE.DoubleSide));
    const hits: THREE.Intersection[] = [];
    b.mesh.raycast(ray, hits);
    mats.forEach((m, i) => (m.side = sides[i]));
    return hits.length % 2 === 1;
  };
  for (const a of items) {
    const pos = a.mesh.geometry.attributes.position as THREE.BufferAttribute;
    const centre = a.box.getCenter(new THREE.Vector3());
    const step = Math.max(1, Math.floor(pos.count / 60));
    for (const b of items) {
      if (a === b || !b.closed || a.owner === b.owner) continue;
      shrunk.copy(b.box).expandByScalar(-0.003);
      if (!shrunk.intersectsBox(a.box)) continue;
      let n = 0;
      let of = 0;
      const where = new THREE.Vector3();
      for (let i = 0; i < pos.count; i += step) {
        const v = new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(a.mesh.matrixWorld);
        const d = centre.clone().sub(v);
        v.addScaledVector(d, Math.min(1, 0.003 / Math.max(d.length(), 1e-6)));
        of++;
        if (!shrunk.containsPoint(v)) continue;
        if (inside(v, b)) {
          n++;
          where.copy(v);
        }
      }
      if (n >= 2 && n / of >= 0.04) {
        const key = [a.owner, b.owner].sort().join(' × ');
        const prev = found.get(key);
        if (!prev || prev.points < n) found.set(key, { a: `${a.owner} (${a.mesh.geometry.type.replace('Geometry', '')})`, b: `${b.owner} (${b.mesh.geometry.type.replace('Geometry', '')})`, points: n, of, where: where.toArray().map((x) => x.toFixed(2)).join(',') });
      }
    }
  }
  return [...found.values()].sort((x, y) => y.points / y.of - x.points / x.of);
}
