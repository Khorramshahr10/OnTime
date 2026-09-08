import {
  Base3D,
  THREE,
  depthFadedLineMaterial,
  dualLabelSprite,
  glowSprite,
  labelSprite,
  retintSprite,
  setFadedColor,
  softDiscTexture,
} from './base3d';
import {
  D2R,
  hourAngle,
  solarDeclination,
  sunPath,
  sunPosition,
  type Vec3,
} from '../../services/solarGeometry';

export interface SunDomeMark {
  name: string;
  time: Date;
  /** Already formatted for display, e.g. "4:44 PM". */
  timeLabel: string;
}

export interface SunDomeData {
  /** Null until the user's location resolves — the dome renders empty rather than lying. */
  latitude: number | null;
  /** Today's Dhuhr; the sun's track is anchored to it. */
  solarNoon: Date | null;
  marks: SunDomeMark[];
  now: Date;
}

const SUN_COLOR = '#fbbf24';
/**
 * Marker label height in world units. The prayer name and its time are the
 * point of this view, so they read larger than the compass letters — at the
 * card's real height a smaller setting lands around 7px of cap height.
 */
const MARK_LABEL_HEIGHT = 0.2;
/** Texture resolution for those labels; higher than the size needs, to stay crisp zoomed in. */
const MARK_LABEL_PX = 44;
const v3 = (p: Vec3) => new THREE.Vector3(p.x, p.y, p.z);

/**
 * The sky dome: the horizon, the sun's track for today, where each prayer
 * falls along it, and the sun's position right now.
 */
export class SunDome extends Base3D<SunDomeData> {
  private group!: THREE.Group;
  /** Everything that depends on the day/location and gets rebuilt on change. */
  private dayGroup!: THREE.Group;
  private markSprites: THREE.Sprite[] = [];
  private compass: THREE.Sprite[] = [];

  private discMat!: THREE.MeshBasicMaterial;
  private ringMat!: THREE.ShaderMaterial;
  private tickMat!: THREE.ShaderMaterial;
  private pastMat!: THREE.ShaderMaterial;
  private markDots: THREE.Mesh[] = [];
  private domeMat!: THREE.ShaderMaterial;
  private pathMat!: THREE.ShaderMaterial;
  private nightMat!: THREE.PointsMaterial;
  private markMat!: THREE.MeshBasicMaterial;

  private sun!: THREE.Mesh;
  private halo!: THREE.Sprite;
  private dayKey = '';
  private sunYaw = 0;

  protected build(): void {
    const C = this.colors;
    this.group = new THREE.Group();
    this.scene.add(this.group);

    // Horizon disc + rim
    this.discMat = new THREE.MeshBasicMaterial({
      map: softDiscTexture(C.muted, 0.3),
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 64), this.discMat);
    disc.rotation.x = -Math.PI / 2;
    this.group.add(disc);

    this.ringMat = depthFadedLineMaterial(C.muted, 0.8, 0.07);
    const ring: THREE.Vector3[] = [];
    for (let a = 0; a <= 360; a += 2) {
      ring.push(new THREE.Vector3(Math.cos(a * D2R), 0, Math.sin(a * D2R)));
    }
    this.group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(ring), this.ringMat));

    // Graduated horizon, engraved like the limb of an astrolabe: long marks at
    // the cardinals, medium every 30°, hairlines every 10°.
    const ticks: THREE.Vector3[] = [];
    for (let a = 0; a < 360; a += 10) {
      const length = a % 90 === 0 ? 0.085 : a % 30 === 0 ? 0.05 : 0.028;
      const ca = Math.cos(a * D2R);
      const sa = Math.sin(a * D2R);
      ticks.push(new THREE.Vector3(ca, 0, sa), new THREE.Vector3(ca * (1 + length), 0, sa * (1 + length)));
    }
    this.tickMat = depthFadedLineMaterial(C.muted, 0.55, 0.05);
    this.group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(ticks), this.tickMat));

    // Dome graticule: altitude circles + azimuth meridians
    const dome: THREE.Vector3[] = [];
    for (let alt = 15; alt < 90; alt += 15) {
      const r = Math.cos(alt * D2R);
      const y = Math.sin(alt * D2R);
      for (let a = 0; a < 360; a += 4) {
        dome.push(
          new THREE.Vector3(r * Math.cos(a * D2R), y, r * Math.sin(a * D2R)),
          new THREE.Vector3(r * Math.cos((a + 4) * D2R), y, r * Math.sin((a + 4) * D2R))
        );
      }
    }
    for (let az = 0; az < 360; az += 30) {
      const ca = Math.cos(az * D2R);
      const sa = Math.sin(az * D2R);
      for (let alt = 0; alt < 90; alt += 4) {
        const r1 = Math.cos(alt * D2R);
        const r2 = Math.cos((alt + 4) * D2R);
        dome.push(
          new THREE.Vector3(r1 * ca, Math.sin(alt * D2R), r1 * sa),
          new THREE.Vector3(r2 * ca, Math.sin((alt + 4) * D2R), r2 * sa)
        );
      }
    }
    // Muted rather than border, which is invisible against the light themes.
    this.domeMat = depthFadedLineMaterial(C.muted, 0.16, 0.02);
    this.group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(dome), this.domeMat));

    // Materials reused by the rebuildable day layer
    this.pathMat = depthFadedLineMaterial(C.primary, 1, 0.08);
    // The part of the day already spent, drawn back so the arc reads as a
    // day in progress rather than a static curve.
    this.pastMat = depthFadedLineMaterial(C.muted, 0.6, 0.05);
    this.nightMat = new THREE.PointsMaterial({
      color: C.muted,
      size: 0.012,
      transparent: true,
      opacity: 0.5,
    });
    this.markMat = new THREE.MeshBasicMaterial({ color: C.muted });

    this.dayGroup = new THREE.Group();
    this.group.add(this.dayGroup);

    // The sun and its halo
    this.sun = new THREE.Mesh(
      new THREE.SphereGeometry(0.032, 24, 18),
      new THREE.MeshBasicMaterial({ color: SUN_COLOR })
    );
    this.halo = glowSprite(SUN_COLOR);
    this.halo.scale.setScalar(0.17);
    this.halo.renderOrder = 1;
    this.group.add(this.sun, this.halo);

    // Compass letters
    ([['N', 0], ['E', 90], ['S', 180], ['W', 270]] as const).forEach(([t, az]) => {
      const s = labelSprite(t, C.muted, 40);
      s.renderOrder = 10;
      s.position.set(Math.sin(az * D2R) * 1.1, 0.02, -Math.cos(az * D2R) * 1.1);
      this.group.add(s);
      this.compass.push(s);
    });

    this.camera.position.set(0.42, 1.18, 3.8);
    this.rebuildDay();
  }

  protected configureControls(): void {
    this.controls.target.set(0, 0.34, 0);
    this.controls.maxPolarAngle = Math.PI / 2 + 0.12;
    this.controls.minPolarAngle = 0.15;
    // Deliberately still. The dome turns to put the current part of the sky in
    // front of you; drifting past it would undo that every few seconds.
    this.controls.autoRotate = false;
  }

  protected onData(): void {
    this.rebuildDay();
  }

  protected resize(): void {
    super.resize();
    // Floor is well above 1.0 so zooming never puts the camera inside the dome.
    this.setFramedDistance(this.framedDistance, 0.62, 1.2);
  }

  protected onReset(): void {
    this.group.rotation.y = this.sunYaw;
  }

  /** The halo pulses on its own clock, so this view can never park. */
  protected animatesContinuously(): boolean {
    return true;
  }

  protected tick(t: number): void {
    this.halo.scale.setScalar(0.17 * (1 + Math.sin(t * 1.4) * 0.045));
    this.recedeFarSide();
  }

  /**
   * Let the back of the dome sit behind the front. Nothing here is opaque, so
   * without this the far side's markers read as loudly as the near side's and
   * the two sets of times tangle together.
   */
  private recedeFarSide(): void {
    // World positions, not local ones: the dome group is turned to face the
    // sun, so a marker's local coordinates say nothing about where it actually
    // is on screen.
    const world = new THREE.Vector3();

    for (const dot of this.markDots) {
      const material = dot.material as THREE.MeshBasicMaterial;
      material.transparent = true;
      material.opacity = this.depthOpacity(this.facing(dot.getWorldPosition(world)), 0.1);
    }
    for (const sprite of this.markSprites) {
      const floor = sprite.userData.isNext ? 0.5 : 0.08;
      sprite.material.opacity = this.depthOpacity(this.facing(sprite.getWorldPosition(world)), floor);
      this.anchorAwayFromEdge(sprite);
    }
    this.separateLabels();
    for (const letter of this.compass) {
      letter.material.opacity = this.depthOpacity(this.facing(letter.getWorldPosition(world)), 0.12);
    }
  }

  protected applyColors(): void {
    const C = this.colors;
    this.discMat.map?.dispose();
    this.discMat.map = softDiscTexture(C.muted, 0.3);
    this.discMat.needsUpdate = true;
    setFadedColor(this.ringMat, C.muted);
    setFadedColor(this.tickMat, C.muted);
    setFadedColor(this.domeMat, C.muted);
    setFadedColor(this.pathMat, C.primary);
    setFadedColor(this.pastMat, C.muted);
    this.nightMat.color.set(C.muted);
    this.markMat.color.set(C.muted);
    this.compass.forEach((s) => retintSprite(s, C.muted, 40));
    // Markers and their two-tone labels bake the palette into canvas textures,
    // so rebuild the day layer outright rather than trying to repaint each one.
    this.dayKey = '';
    this.rebuildDay();
  }

  /** Rebuild the sun track and prayer markers when the day or location changes. */
  /**
   * Nudge overlapping labels apart on screen. Prayers bunch up wherever the
   * sun's track meets the horizon — around sunset Maghrib and Isha sit almost
   * on top of each other — and no fixed offset in 3D fixes that for every hour
   * of the day. Shifting the sprite's anchor moves it on screen without moving
   * the marker it belongs to.
   */
  private separateLabels(): void {
    // Every visible label takes part, however faint — a dim label sitting on a
    // bright one is precisely what makes the card hard to read.
    const placed = this.markSprites
      .filter((sprite) => sprite.visible)
      .map((sprite) => {
        sprite.center.y = 0.5;
        return { sprite, ndc: sprite.getWorldPosition(new THREE.Vector3()).project(this.camera) };
      });

    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i];
        const b = placed[j];
        if (Math.abs(a.ndc.x - b.ndc.x) > 0.52 || Math.abs(a.ndc.y - b.ndc.y) > 0.18) continue;
        // Whichever sits higher goes up, the other drops.
        const upper = a.ndc.y >= b.ndc.y ? a.sprite : b.sprite;
        const lower = upper === a.sprite ? b.sprite : a.sprite;
        // Overshoot a little: if the lower label then gets clamped back at the
        // card's edge, the extra spread on the upper one preserves the gap.
        upper.center.y = -0.15;
        lower.center.y = 1.15;
      }
    }

    // Staying on screen outranks staying apart: a label close to the top or
    // bottom edge grows back into the card rather than off it.
    for (const { sprite, ndc } of placed) {
      if (ndc.y < -0.66) sprite.center.y = 0;
      else if (ndc.y > 0.66) sprite.center.y = 1;
    }
  }

  /**
   * Hang a label off the side of its marker that points back into the view, so
   * one sitting near the edge of the card grows inwards instead of off it.
   * The dead zone in the middle stops it flipping back and forth as the dome
   * turns through the centre.
   */
  private anchorAwayFromEdge(sprite: THREE.Sprite): void {
    const ndcX = sprite.getWorldPosition(new THREE.Vector3()).project(this.camera).x;
    if (ndcX > 0.12) sprite.center.x = 1;
    else if (ndcX < -0.12) sprite.center.x = 0;
  }

  private rebuildDay(): void {
    const { latitude, solarNoon, marks, now } = this.data;

    // The "next prayer" accent is baked into the marker colours, so it has
    // to be part of the rebuild key — otherwise the highlight stays on the
    // passed prayer until some other change forces a rebuild.
    const nextIndex = latitude !== null ? marks.findIndex((m) => m.time.getTime() > now.getTime()) : -1;
    const key = [
      latitude ?? 'none',
      solarNoon?.getTime() ?? 'none',
      nextIndex,
      marks.map((m) => `${m.name}${m.time.getTime()}${m.timeLabel}`).join(','),
    ].join('|');

    if (key !== this.dayKey) {
      this.dayKey = key;
      this.clearDayGroup();

      if (latitude !== null && solarNoon) {
        const declination = solarDeclination(now);

        // Sun track — solid where the sun is up, stippled where it's down.
        const { above, below } = sunPath(latitude, declination, 1);
        if (above.length > 1) {
          const pts = above.map((p) => v3(p).multiplyScalar(1.001));
          // Split the daylight arc where the sun is now.
          const nowH = hourAngle(now, solarNoon);
          const nowPoint = v3(sunPosition(latitude, declination, nowH).v);
          let cut = 0;
          let best = Infinity;
          pts.forEach((p, i) => {
            const d = p.distanceToSquared(nowPoint);
            if (d < best) {
              best = d;
              cut = i;
            }
          });
          const spent = pts.slice(0, Math.max(2, cut + 1));
          const left = pts.slice(Math.max(0, cut));
          if (spent.length > 1) {
            this.dayGroup.add(
              new THREE.Line(new THREE.BufferGeometry().setFromPoints(spent), this.pastMat)
            );
          }
          if (left.length > 1) {
            this.dayGroup.add(
              new THREE.Line(new THREE.BufferGeometry().setFromPoints(left), this.pathMat)
            );
          }
        }
        if (below.length > 1) {
          const pts = below.map((p) => v3(p).multiplyScalar(1.001));
          this.dayGroup.add(new THREE.Points(new THREE.BufferGeometry().setFromPoints(pts), this.nightMat));
        }

        // Prayer markers along the track
        this.markSprites = [];
        this.markDots = [];
        // Where the sun is now, so a marker sitting under it can step aside.
        const sunNow = v3(sunPosition(latitude, declination, hourAngle(now, solarNoon)).v);

        // Face the quarter of the sky the sun is in, so the prayers either side
        // of now sit in front of the viewer instead of round the edge.
        this.sunYaw = -Math.atan2(sunNow.x, sunNow.z);
        if (!this.isAdjusted()) this.group.rotation.y = this.sunYaw;

        marks.forEach((mark, index) => {
          const isNext = index === nextIndex;
          const { v } = sunPosition(latitude, declination, hourAngle(mark.time, solarNoon));
          // Each marker owns its material so the far side can fade on its own.
          const dotMaterial = this.markMat.clone();
          if (isNext) dotMaterial.color.set(this.colors.primary);
          const dot = new THREE.Mesh(
            new THREE.SphereGeometry(isNext ? 0.03 : 0.022, 16, 12),
            dotMaterial
          );
          dot.position.copy(v3(v));
          this.dayGroup.add(dot);
          this.markDots.push(dot);

          const label = dualLabelSprite(
            mark.name,
            mark.timeLabel,
            isNext ? this.colors.primary : this.colors.text,
            isNext ? this.colors.primary : this.colors.text,
            MARK_LABEL_PX,
            MARK_LABEL_HEIGHT
          );
          label.renderOrder = 10;
          label.userData.isNext = isNext;
          // Alternate the height so labels bunched near the horizon at dawn
          // and dusk don't sit on top of each other, and lift clear of the sun
          // when a prayer falls close to the present moment.
          // Push each label outward along its own radius rather than straight
          // up. Lifting by a fixed amount collided whenever a lower marker got
          // the bigger lift; radial placement separates them the way the
          // markers themselves are separated.
          // A prayer close to the sun gets pushed further out from the dome
          // rather than lifted: the sun sits above the Maghrib marker before
          // sunset, so lifting drove the label into the glow, and offsetting
          // away from the sun drove it under the horizon into Isha.
          const marker = v3(v);
          const nearSun = marker.angleTo(sunNow) < 0.45;
          // A prayer below the horizon is already near the bottom of the card;
          // pushing its label further out drives it off the edge, so those hug
          // the dome instead.
          const belowHorizon = marker.y < 0;
          const outward = belowHorizon
            ? 1.02
            : 1.16 + (index % 2 === 0 ? 0 : 0.1) + (nearSun ? 0.24 : 0);
          label.position.copy(marker).multiplyScalar(outward).add(new THREE.Vector3(0, 0.04, 0));

          this.dayGroup.add(label);
          this.markSprites.push(label);
        });
        this.sprites = [...this.markSprites, ...this.compass];
      } else {
        this.markSprites = [];
        this.sprites = [...this.compass];
      }
    }

    this.positionSun();
  }

  private positionSun(): void {
    const { latitude, solarNoon, now } = this.data;
    const show = latitude !== null && solarNoon !== null;
    this.sun.visible = show;
    this.halo.visible = show;
    if (!show) return;

    const { v } = sunPosition(latitude, solarDeclination(now), hourAngle(now, solarNoon!));
    this.sun.position.copy(v3(v));
    this.halo.position.copy(v3(v));
  }

  private clearDayGroup(): void {
    for (const child of [...this.dayGroup.children]) {
      this.dayGroup.remove(child);
      const obj = child as THREE.Mesh | THREE.Sprite;
      (obj as THREE.Mesh).geometry?.dispose();
      // Marker dots own cloned materials; the lines share long-lived ones.
      if (child instanceof THREE.Mesh) (child.material as THREE.Material).dispose();
      // Shared materials (path/night/mark) outlive the rebuild; only the
      // per-label sprite materials and their textures are ours to free.
      if (child instanceof THREE.Sprite) {
        child.material.map?.dispose();
        child.material.dispose();
      }
    }
  }
}
