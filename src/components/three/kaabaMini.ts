import { Base3D, THREE } from './base3d';

/** A small, slowly turning Kaaba for the qibla bearing card. */
export class KaabaMini extends Base3D<void> {
  private group!: THREE.Group;
  private stone!: THREE.MeshStandardMaterial;

  protected build(): void {
    const C = this.colors;
    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const key = new THREE.DirectionalLight(0xffffff, 1.5);
    key.position.set(2.5, 3.5, 2);
    const fill = new THREE.DirectionalLight(0xffffff, 0.5);
    fill.position.set(-2, 0.5, -1.5);
    this.scene.add(key, fill);

    const kiswah = new THREE.MeshStandardMaterial({ color: '#131316', roughness: 0.72, metalness: 0.12 });
    const gold = new THREE.MeshStandardMaterial({ color: '#C8954C', roughness: 0.3, metalness: 0.85 });
    this.stone = new THREE.MeshStandardMaterial({ color: C.border, roughness: 0.9, metalness: 0.05 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(1, 1.12, 1), kiswah);
    body.position.y = 0.62;

    const band = new THREE.Mesh(new THREE.BoxGeometry(1.015, 0.13, 1.015), gold);
    band.position.y = 0.92;

    const door = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.52, 0.02), gold);
    door.position.set(0.16, 0.5, 0.511);

    const base = new THREE.Mesh(new THREE.BoxGeometry(1.34, 0.12, 1.34), this.stone);

    this.group.add(body, band, door, base);
    this.group.rotation.y = -0.45;

    this.camera.position.set(1.5, 1.5, 2.35);
    this.camera.lookAt(0, 0.6, 0);
  }

  protected configureControls(): void {
    this.controls.target.set(0, 0.6, 0);
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 1.1;
    this.controls.minPolarAngle = 0.5;
    this.controls.maxPolarAngle = Math.PI / 2 + 0.05;
    this.controls.addEventListener('start', () => {
      this.controls.autoRotate = false;
    });
  }

  protected applyColors(): void {
    this.stone.color.set(this.colors.border);
  }
}
