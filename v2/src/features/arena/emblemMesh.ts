import type { BabylonModule, Mesh, Scene, TransformNode } from './arenaTypes';
import type { EmblemAsset, RibbonMesh, SolidMesh } from './emblemFormat';

type Material = NonNullable<Mesh['material']>;

function toMesh(B: BabylonModule, scene: Scene, name: string, data: SolidMesh | RibbonMesh, parent: TransformNode, material: Material): Mesh {
  const mesh = new B.Mesh(name, scene);
  const vertexData = new B.VertexData();
  vertexData.positions = data.positions;
  vertexData.normals = data.normals;
  vertexData.indices = data.indices;
  if (data.uvs) vertexData.uvs = data.uvs;
  if ('uvs2' in data) vertexData.uvs2 = data.uvs2;
  vertexData.applyToMesh(mesh, false);
  mesh.parent = parent;
  mesh.material = material;
  mesh.isPickable = false;
  return mesh;
}

export interface EmblemNodes {
  /** Positioned (and later glided) on the page; never rotates. */
  readonly root: TransformNode;
  /** Turns with the pointer. */
  readonly pivot: TransformNode;
  readonly cap: Mesh;
  readonly side: Mesh;
  readonly halo: Mesh;
  readonly current: Mesh;
}

/** Four meshes from the baked buffers: steel front, steel sides, the halo behind it and the ignition current in front. */
export function createEmblemNodes(B: BabylonModule, scene: Scene, asset: EmblemAsset, materials: {
  readonly cap: Material; readonly side: Material; readonly halo: Material; readonly current: Material;
}): EmblemNodes {
  const root = new B.TransformNode('emblemRoot', scene);
  const pivot = new B.TransformNode('emblemPivot', scene);
  pivot.parent = root;
  const cap = toMesh(B, scene, 'emblemCap', asset.cap, pivot, materials.cap);
  const side = toMesh(B, scene, 'emblemSide', asset.side, pivot, materials.side);
  const halo = toMesh(B, scene, 'emblemHalo', asset.halo, pivot, materials.halo);
  const current = toMesh(B, scene, 'emblemCurrent', asset.current, pivot, materials.current);
  // Transparent queue order: the steel first (it writes depth), then the glow that may sit behind it, then the run on top.
  cap.alphaIndex = 0; side.alphaIndex = 1; halo.alphaIndex = 2; current.alphaIndex = 3;
  return { root, pivot, cap, side, halo, current };
}
