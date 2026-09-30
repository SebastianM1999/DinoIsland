import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import fs from 'node:fs/promises';

// Three's exporter uses FileReader; Node supplies Blob but not FileReader.
globalThis.FileReader ||= class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then(result => { this.result = result; this.onloadend?.(); });
  }
  readAsDataURL(blob) {
    blob.arrayBuffer().then(result => {
      this.result = `data:${blob.type};base64,${Buffer.from(result).toString('base64')}`;
      this.onloadend?.();
    });
  }
};
export async function exportGLB(scene, animations, path) {
  const binary = await new GLTFExporter().parseAsync(scene, { binary: true, animations, onlyVisible: false });
  await fs.writeFile(path, Buffer.from(binary));
}
