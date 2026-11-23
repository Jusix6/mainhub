/**
 * 2 Many Notes, phase 4: the look. The day goes by with the progress (share
 * of notes done, 0 → 1): morning, noon, afternoon, evening, and with the last
 * note the sun sets. That moves the daylight (sun colour, height, strength),
 * the room light, the sky in the window (a small pixel canvas with a city,
 * clouds, rain, lit windows in the evening), a patch of sunlight on the floor
 * and the colour grading. From about half way it rains for a while.
 *
 * Post-processing (EffectComposer): a little bloom (the screen, the lamp, the
 * notes), then our own pass: tint, saturation, contrast, vignette and film
 * grain. Slow devices get less (no bloom, then no post at all), measured in
 * the first seconds. Optional: the PS1 "vertex wobble" (vertices snap to a
 * coarse grid), a switch in the settings.
 *
 * Update 2, phase A: the pixel look (picked from three tries) besides the old one ("classic"). The
 * room is drawn small (a few hundred lines) and scaled up with crisp pixels,
 * the light falls in steps (toon, shadows a little violet), edges get dark
 * lines from the depth, and what is not in focus goes soft (depth of field).
 * Notes and the DeskOS screen are drawn again at full resolution on top
 * (layer 1), hidden by the low-res depth where something is in front, so
 * reading never suffers.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import type { World } from './world';

interface Key {
  p: number;
  sun: string;
  sunI: number;
  elev: number;
  az: number;
  hemi: string;
  hemiI: number;
  top: string;
  bottom: string;
  disc: string;
  tint: [number, number, number];
  sat: number;
}

/** The day, by progress. */
const KEYS: Key[] = [
  {
    p: 0,
    sun: '#ffdcb0',
    sunI: 1.0,
    elev: 0.28,
    az: -0.55,
    hemi: '#dfe5ee',
    hemiI: 1.0,
    top: '#8cc1ee',
    bottom: '#ffe0bf',
    disc: '#fff1c4',
    tint: [0.97, 1.0, 1.05],
    sat: 1.0,
  },
  {
    p: 0.35,
    sun: '#fff6e8',
    sunI: 1.3,
    elev: 1.0,
    az: -0.1,
    hemi: '#f4f1e9',
    hemiI: 1.12,
    top: '#5ea7ea',
    bottom: '#cfe6ff',
    disc: '#ffffff',
    tint: [1, 1, 1],
    sat: 1.05,
  },
  {
    p: 0.7,
    sun: '#ffe2b8',
    sunI: 1.15,
    elev: 0.6,
    az: 0.35,
    hemi: '#efe3d0',
    hemiI: 1.04,
    top: '#6a9fd6',
    bottom: '#f4d6aa',
    disc: '#fff3d6',
    tint: [1.03, 1.0, 0.95],
    sat: 1.08,
  },
  {
    p: 0.9,
    sun: '#ff9858',
    sunI: 0.95,
    elev: 0.18,
    az: 0.65,
    hemi: '#e9c8a4',
    hemiI: 0.98,
    top: '#495b9b',
    bottom: '#ff9a5a',
    disc: '#ffcf80',
    tint: [1.08, 0.97, 0.87],
    sat: 1.12,
  },
  {
    p: 1,
    sun: '#ff7a50',
    sunI: 0.5,
    elev: 0.02,
    az: 0.8,
    hemi: '#b2a6c4',
    hemiI: 0.9,
    top: '#1c2245',
    bottom: '#cf6449',
    disc: '#ff8a5a',
    tint: [0.98, 0.94, 1.05],
    sat: 1.0,
  },
];

/** Rain: from half way, gone again before the sunset. */
export function rainAt(p: number) {
  const up = THREE.MathUtils.smoothstep(p, 0.48, 0.55);
  const down = 1 - THREE.MathUtils.smoothstep(p, 0.8, 0.87);
  return up * down;
}

const c3 = (hex: string) => new THREE.Color(hex);

function sample(p: number) {
  let i = 0;
  while (i < KEYS.length - 2 && p > KEYS[i + 1].p) i++;
  const a = KEYS[i];
  const b = KEYS[i + 1];
  const k = THREE.MathUtils.clamp((p - a.p) / (b.p - a.p), 0, 1);
  const lerp = (x: number, y: number) => x + (y - x) * k;
  const col = (x: string, y: string) => c3(x).lerp(c3(y), k);
  return {
    sun: col(a.sun, b.sun),
    sunI: lerp(a.sunI, b.sunI),
    elev: lerp(a.elev, b.elev),
    az: lerp(a.az, b.az),
    hemi: col(a.hemi, b.hemi),
    hemiI: lerp(a.hemiI, b.hemiI),
    top: col(a.top, b.top),
    bottom: col(a.bottom, b.bottom),
    disc: col(a.disc, b.disc),
    tint: new THREE.Vector3(lerp(a.tint[0], b.tint[0]), lerp(a.tint[1], b.tint[1]), lerp(a.tint[2], b.tint[2])),
    sat: lerp(a.sat, b.sat),
  };
}

const GRADE = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    tint: { value: new THREE.Vector3(1, 1, 1) },
    sat: { value: 1 },
    contrast: { value: 1.06 },
    vignette: { value: 0.32 },
    grain: { value: 0.035 },
    time: { value: 0 },
    aspect: { value: 1 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec3 tint;
    uniform float sat;
    uniform float contrast;
    uniform float vignette;
    uniform float grain;
    uniform float time;
    uniform float aspect;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = c.rgb * tint;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, sat);
      col = max(vec3(0.0), (col - 0.18) * contrast + 0.18);
      vec2 d = (vUv - 0.5) * vec2(aspect, 1.0);
      float v = smoothstep(0.95, 0.3, length(d));
      col *= mix(1.0 - vignette, 1.0, v);
      float n = hash(vUv * 811.0 + fract(time * 13.7)) - 0.5;
      col += n * grain * (0.25 + sqrt(l));
      gl_FragColor = vec4(col, c.a);
    }`,
};

/** The looks (Update 2): how the room is drawn. */
export type LookName = 'pixel' | 'classic';
export const LOOKS: LookName[] = ['pixel', 'classic'];
interface Variant {
  /** Lines the room is drawn with (for a 16:9 screen; other shapes keep the pixel count). */
  lines: number;
  steps: number;
  soft: number;
  shade: string;
  outline: number;
  outlineThr: number;
  dof: number;
  maxBlur: number;
  tilt: number;
  glow: number;
  pigment: number;
  grain: number;
  paper: number;
  sat: number;
  contrast: number;
  warm: string;
  lift: string;
  /** Soft upscaling instead of crisp pixels. */
  smooth?: boolean;
  exposure?: number;
}
const VARIANTS: Record<Exclude<LookName, 'classic'>, Variant> = {
  // Big pixels, light in three steps, thin dark lines, a soft background
  pixel: {
    lines: 240,
    steps: 3,
    soft: 0.06,
    shade: '#7d72b0',
    outline: 0.42,
    outlineThr: 0.045,
    dof: 1.0,
    maxBlur: 2.2,
    tilt: 0,
    glow: 0.35,
    pigment: 0,
    grain: 0.018,
    paper: 0,
    sat: 1.1,
    contrast: 1.05,
    warm: '#fff0d8',
    lift: '#3a2f52',
  },
};

const FX = {
  uniforms: {
    tColor: { value: null as THREE.Texture | null },
    tDepth: { value: null as THREE.Texture | null },
    uTexel: { value: new THREE.Vector2() },
    uNear: { value: 0.02 },
    uFar: { value: 30 },
    uFocus: { value: 1 },
    uFocusAmt: { value: 1 },
    uDof: { value: 1 },
    uMaxBlur: { value: 2 },
    uTilt: { value: 0 },
    uOutline: { value: 0.4 },
    uOutlineThr: { value: 0.05 },
    uGlow: { value: 0.3 },
    uPigment: { value: 0 },
    uLite: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tColor;
    uniform sampler2D tDepth;
    uniform vec2 uTexel;
    uniform float uNear, uFar, uFocus, uFocusAmt, uDof, uMaxBlur, uTilt, uOutline, uOutlineThr, uGlow, uPigment, uLite;
    varying vec2 vUv;
    float dist(vec2 uv) {
      float d = texture2D(tDepth, uv).x;
      return (uNear * uFar) / (uFar - d * (uFar - uNear));
    }
    float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
    const vec2 TAPS[12] = vec2[12](
      vec2(1.0, 0.0), vec2(0.5, 0.87), vec2(-0.5, 0.87), vec2(-1.0, 0.0), vec2(-0.5, -0.87), vec2(0.5, -0.87),
      vec2(0.43, 0.25), vec2(0.0, 0.5), vec2(-0.43, 0.25), vec2(-0.43, -0.25), vec2(0.0, -0.5), vec2(0.43, -0.25)
    );
    void main() {
      vec3 col = texture2D(tColor, vUv).rgb;
      float z = dist(vUv);
      // Lines where the depth jumps (on the nearer side), and pigment edges where the colour does
      float zr = dist(vUv + vec2(uTexel.x, 0.0));
      float zl = dist(vUv - vec2(uTexel.x, 0.0));
      float zu = dist(vUv + vec2(0.0, uTexel.y));
      float zd = dist(vUv - vec2(0.0, uTexel.y));
      float jump = max(max(zr, zl), max(zu, zd)) - z;
      float edge = step(uOutlineThr * z + 0.01, jump);
      float coc = uLite > 0.5 ? 0.0 : uDof * uFocusAmt * max(0.0, abs(z - uFocus) / max(z, 0.05) - 0.08) * 2.4;
      coc += uTilt * smoothstep(0.16, 0.5, abs(vUv.y - 0.5)) * uMaxBlur;
      coc = min(coc, uMaxBlur);
      float sharpness = 1.0 - smoothstep(0.6, 1.8, coc);
      if (uPigment > 0.0) {
        vec3 cr = texture2D(tColor, vUv + vec2(uTexel.x, 0.0)).rgb;
        vec3 cu = texture2D(tColor, vUv + vec2(0.0, uTexel.y)).rgb;
        float d = abs(lum(col) - lum(cr)) + abs(lum(col) - lum(cu));
        col *= 1.0 - uPigment * smoothstep(0.02, 0.25, d) * 0.35;
      }
      col *= 1.0 - uOutline * edge * sharpness;
      if (coc > 0.35) {
        vec3 sum = col;
        float n = 1.0;
        for (int i = 0; i < 12; i++) {
          vec2 o = TAPS[i] * coc * uTexel;
          // Things in front do not bleed into what is behind them sharp
          float zs = dist(vUv + o);
          float w = zs < z - 0.15 ? 0.3 : 1.0;
          sum += texture2D(tColor, vUv + o).rgb * w;
          n += w;
        }
        col = mix(col, sum / n, smoothstep(0.35, 1.0, coc));
      }
      if (uGlow > 0.0 && uLite < 0.5) {
        vec3 g = vec3(0.0);
        for (int i = 0; i < 6; i++) {
          vec3 c = texture2D(tColor, vUv + TAPS[i] * 3.0 * uTexel).rgb;
          g += max(c - 0.72, 0.0);
        }
        col += g / 6.0 * uGlow;
      }
      gl_FragColor = vec4(col, 1.0);
    }`,
};

const FINAL = {
  uniforms: {
    tLow: { value: null as THREE.Texture | null },
    tSharp: { value: null as THREE.Texture | null },
    uLowSize: { value: new THREE.Vector2(1, 1) },
    uScale: { value: new THREE.Vector2(1, 1) },
    uRes: { value: new THREE.Vector2(1, 1) },
    tint: { value: new THREE.Vector3(1, 1, 1) },
    sat: { value: 1 },
    contrast: { value: 1.05 },
    exposure: { value: 1 },
    vignette: { value: 0.22 },
    grain: { value: 0.02 },
    paper: { value: 0 },
    warm: { value: new THREE.Color('#fff0d8') },
    lift: { value: new THREE.Color('#3a2f52') },
    time: { value: 0 },
    aspect: { value: 1 },
  },
  vertexShader: FX.vertexShader,
  fragmentShader: /* glsl */ `
    uniform sampler2D tLow;
    uniform sampler2D tSharp;
    uniform vec2 uLowSize, uScale, uRes;
    uniform vec3 tint, warm, lift;
    uniform float sat, contrast, exposure, vignette, grain, paper, time, aspect;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    float vnoise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
    }
    void main() {
      // Crisp pixels at any scale (sharp bilinear)
      vec2 texel = vUv * uLowSize;
      vec2 tf = floor(texel);
      vec2 cd = fract(texel) - 0.5;
      vec2 range = 0.5 - 0.5 / uScale;
      vec2 f = (cd - clamp(cd, -range, range)) * uScale + 0.5;
      vec3 col = texture2D(tLow, (tf + f) / uLowSize).rgb * tint * exposure;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, sat);
      col = max(vec3(0.0), (col - 0.18) * contrast + 0.18);
      // Warm light, violet shadows
      col *= mix(vec3(1.0), warm, smoothstep(0.35, 1.0, l));
      col = mix(col, col + lift * 0.18, 1.0 - smoothstep(0.0, 0.25, l));
      // Paper: a fine grain that stays put
      if (paper > 0.0) {
        vec2 px = vUv * uRes;
        float pn = vnoise(px * 0.18) * 0.6 + vnoise(px * 0.7) * 0.4;
        col *= 1.0 - paper * (pn - 0.35);
      }
      vec2 d = (vUv - 0.5) * vec2(aspect, 1.0);
      col *= mix(1.0 - vignette, 1.0, smoothstep(0.95, 0.3, length(d)));
      float n = hash(vUv * 811.0 + fract(time * 13.7)) - 0.5;
      col += n * grain * (0.25 + sqrt(l));
      // Notes and the screen, sharp on top (already lit; only a hint of the day's tint, they stay bright)
      vec4 s = texture2D(tSharp, vUv);
      col = col * (1.0 - s.a) + s.rgb * mix(vec3(1.0), tint, 0.25);
      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
};

export function createLook(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, world: World) {
  /* ---- post-processing ---- */
  const size = new THREE.Vector2();
  renderer.getSize(size);
  const target = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    samples: renderer.capabilities.isWebGL2 ? 4 : 0,
  });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.32, 0.5, 0.82);
  composer.addPass(bloom);
  const grade = new ShaderPass(GRADE);
  composer.addPass(grade);
  composer.addPass(new OutputPass());
  let effects = true;

  /* ---- the new looks: low-res room + fx + sharp layer ---- */
  let lookName: LookName = 'pixel';
  let v = VARIANTS.pixel;
  const lowRT = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
  });
  lowRT.depthTexture = new THREE.DepthTexture(1, 1);
  lowRT.depthTexture.type = THREE.UnsignedIntType;
  const fxRT = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
  });
  const sharpRT = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    samples: renderer.capabilities.isWebGL2 ? 4 : 0,
  });
  const fxQuad = new FullScreenQuad(
    new THREE.ShaderMaterial({
      ...FX,
      uniforms: THREE.UniformsUtils.clone(FX.uniforms),
    }),
  );
  const finalQuad = new FullScreenQuad(
    new THREE.ShaderMaterial({
      ...FINAL,
      uniforms: THREE.UniformsUtils.clone(FINAL.uniforms),
    }),
  );
  const fxU = (fxQuad.material as THREE.ShaderMaterial).uniforms;
  const finU = (finalQuad.material as THREE.ShaderMaterial).uniforms;
  fxU.tColor.value = lowRT.texture;
  fxU.tDepth.value = lowRT.depthTexture;
  finU.tLow.value = fxRT.texture;
  finU.tSharp.value = sharpRT.texture;
  let focus = 1;
  let focusWant = 1;
  let focusAmt = 0.3;
  let focusAmtWant = 0.3;
  let fxLite = false;
  // Notes and the screen live on layer 1 (drawn sharp); the camera sees both layers
  camera.layers.enable(1);

  /** Toon light (in the materials) and the sharp layer's depth test share these. */
  const toon = {
    uToon: { value: 0 },
    uSteps: { value: 3 },
    uSoft: { value: 0.06 },
    uShade: { value: new THREE.Color('#7d72b0') },
  };
  const sharpU = {
    uSharp: { value: 0 },
    tSceneDepth: { value: lowRT.depthTexture as THREE.Texture },
    uSceneRes: { value: new THREE.Vector2(1, 1) },
    uNear: { value: camera.near },
    uFar: { value: camera.far },
  };

  let vw = 1;
  let vh = 1;
  function sizeLow() {
    const want = v.lines * v.lines * (16 / 9);
    const k = Math.sqrt((vw * vh) / want);
    const lw = Math.max(32, Math.round(vw / k));
    const lh = Math.max(24, Math.round(vh / k));
    lowRT.setSize(lw, lh);
    fxRT.setSize(lw, lh);
    fxU.uTexel.value.set(1 / lw, 1 / lh);
    finU.uLowSize.value.set(lw, lh);
    if (v.smooth) finU.uScale.value.set(1, 1);
    else finU.uScale.value.set(Math.max(1, (vw * renderer.getPixelRatio()) / lw), Math.max(1, (vh * renderer.getPixelRatio()) / lh));
  }
  function setVariant(name: LookName) {
    lookName = name;
    if (name === 'classic') {
      toon.uToon.value = 0;
      return;
    }
    v = VARIANTS[name];
    toon.uToon.value = 1;
    toon.uSteps.value = v.steps;
    toon.uSoft.value = v.soft;
    toon.uShade.value.set(v.shade);
    fxU.uDof.value = v.dof;
    fxU.uMaxBlur.value = v.maxBlur;
    fxU.uTilt.value = v.tilt;
    fxU.uOutline.value = v.outline;
    fxU.uOutlineThr.value = v.outlineThr;
    fxU.uGlow.value = v.glow;
    fxU.uPigment.value = v.pigment;
    finU.grain.value = v.grain;
    finU.paper.value = v.paper;
    finU.contrast.value = v.contrast;
    finU.exposure.value = v.exposure ?? 1;
    (finU.warm.value as THREE.Color).set(v.warm);
    (finU.lift.value as THREE.Color).set(v.lift);
    sizeLow();
  }

  function renderNew() {
    const mask = camera.layers.mask;
    fxU.uNear.value = sharpU.uNear.value = camera.near;
    fxU.uFar.value = sharpU.uFar.value = camera.far;
    fxU.uFocus.value = focus;
    fxU.uFocusAmt.value = focusAmt;
    fxU.uLite.value = fxLite ? 1 : 0;
    // 1. The room, small
    camera.layers.set(0);
    renderer.setRenderTarget(lowRT);
    renderer.clear();
    renderer.render(scene, camera);
    // 2. Lines, focus, glow
    renderer.setRenderTarget(fxRT);
    fxQuad.render(renderer);
    // 3. Notes and the screen, sharp (hidden where the room is in front)
    camera.layers.set(1);
    const bg = scene.background;
    scene.background = null;
    const cc = renderer.getClearColor(new THREE.Color());
    const ca = renderer.getClearAlpha();
    renderer.setClearColor(0x000000, 0);
    sharpU.uSharp.value = 1;
    renderer.setRenderTarget(sharpRT);
    renderer.clear();
    renderer.render(scene, camera);
    sharpU.uSharp.value = 0;
    renderer.setClearColor(cc, ca);
    scene.background = bg;
    camera.layers.mask = mask;
    // 4. Together, scaled up, graded
    renderer.setRenderTarget(null);
    finalQuad.render(renderer);
  }

  /* ---- the sky in the window ---- */
  const SW = 96;
  const SH = 76;
  const skyCanvas = document.createElement('canvas');
  skyCanvas.width = SW;
  skyCanvas.height = SH;
  const sg = skyCanvas.getContext('2d')!;
  const skyTex = new THREE.CanvasTexture(skyCanvas);
  skyTex.colorSpace = THREE.SRGBColorSpace;
  skyTex.magFilter = THREE.NearestFilter;
  skyTex.minFilter = THREE.NearestFilter;
  const skyMat = world.sky.material as THREE.MeshBasicMaterial;
  skyMat.map = skyTex;
  skyMat.needsUpdate = true;
  // A fixed skyline and clouds
  const rand = (() => {
    let a = 99;
    return () => (a = (a * 16807) % 2147483647) / 2147483647;
  })();
  const towers = Array.from({ length: 14 }, (_, i) => ({
    x: i * 7 + Math.floor(rand() * 3),
    w: 5 + Math.floor(rand() * 4),
    h: 10 + Math.floor(rand() * 26),
  }));
  const lit = towers.map((t) => Array.from({ length: Math.floor(t.h / 3) * 2 }, () => rand() < 0.45));
  const clouds = Array.from({ length: 4 }, () => ({
    x: rand() * SW,
    y: 6 + rand() * 18,
    w: 10 + rand() * 12,
  }));
  const drops = Array.from({ length: 70 }, () => ({
    x: rand() * SW,
    y: rand() * SH,
    v: 40 + rand() * 30,
  }));

  function drawSky(p: number, rain: number, t: number) {
    const s = sample(p);
    const grey = c3('#7d8590');
    const top = s.top.clone().lerp(grey, rain * 0.7);
    const bottom = s.bottom.clone().lerp(grey, rain * 0.6);
    const grad = sg.createLinearGradient(0, 0, 0, SH);
    grad.addColorStop(0, `#${top.getHexString()}`);
    grad.addColorStop(1, `#${bottom.getHexString()}`);
    sg.fillStyle = grad;
    sg.fillRect(0, 0, SW, SH);
    // The sun (behind the clouds when it rains)
    if (rain < 0.6) {
      const sx = SW * (0.5 + s.az * 0.45);
      const sy = SH * (0.9 - s.elev * 0.75);
      sg.globalAlpha = 1 - rain;
      sg.fillStyle = `#${s.disc.getHexString()}`;
      sg.beginPath();
      sg.arc(Math.round(sx), Math.round(sy), 5, 0, Math.PI * 2);
      sg.fill();
      sg.globalAlpha = 1;
    }
    // Clouds drift a little
    sg.fillStyle = rain > 0.3 ? 'rgba(110,115,125,0.85)' : 'rgba(255,255,255,0.7)';
    clouds.forEach((c) => {
      const x = Math.round((c.x + t * 1.5) % (SW + 30)) - 15;
      sg.fillRect(x, Math.round(c.y), Math.round(c.w), 3);
      sg.fillRect(x + 3, Math.round(c.y) - 2, Math.round(c.w * 0.5), 2);
    });
    // The city
    const dark =
      p > 0.85
        ? '#22263a'
        : `#${c3('#5a6478')
            .lerp(c3('#2a3046'), THREE.MathUtils.smoothstep(p, 0.7, 1))
            .getHexString()}`;
    towers.forEach((tw, i) => {
      sg.fillStyle = dark;
      sg.fillRect(tw.x, SH - tw.h, tw.w, tw.h);
      if (p > 0.82) {
        sg.fillStyle = '#ffd27a';
        lit[i].forEach((on, j) => {
          if (on && (j * 7 + i) % 10 < (p - 0.82) * 60) sg.fillRect(tw.x + 1 + (j % 2) * 2, SH - tw.h + 2 + Math.floor(j / 2) * 3, 1, 1);
        });
      }
    });
    // Rain streaks
    if (rain > 0.02) {
      sg.fillStyle = `rgba(210,225,240,${0.55 * rain})`;
      drops.forEach((d) => {
        const y = (d.y + t * d.v) % SH;
        const x = (d.x - y * 0.25 + SW) % SW;
        sg.fillRect(Math.round(x), Math.round(y), 1, 3);
      });
    }
    skyTex.needsUpdate = true;
  }

  /* ---- sunlight through the window, a patch on the floor ---- */
  const patchGeo = new THREE.BufferGeometry();
  patchGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
  patchGeo.setIndex([0, 1, 2, 0, 2, 3]);
  const patchMat = new THREE.MeshBasicMaterial({
    color: '#ffffff',
    transparent: true,
    opacity: 0.2,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const patch = new THREE.Mesh(patchGeo, patchMat);
  patch.frustumCulled = false;
  // A patch of light on the floor: it may run under things
  patch.userData.joins = true;
  scene.add(patch);
  const corners = [new THREE.Vector3(-1.58, 1.05, -1.05), new THREE.Vector3(-1.58, 1.05, -0.05), new THREE.Vector3(-1.58, 1.85, -0.05), new THREE.Vector3(-1.58, 1.85, -1.05)];

  const SUN_AT = new THREE.Vector3(0, 0.8, -0.5);
  function applyDay(p: number, rain: number) {
    const s = sample(p);
    const dir = new THREE.Vector3(-Math.cos(s.elev) * Math.cos(s.az), Math.sin(s.elev), -Math.cos(s.elev) * Math.sin(s.az)).normalize();
    world.sun.position.copy(SUN_AT).addScaledVector(dir, 4);
    world.sun.target.position.copy(SUN_AT);
    world.sun.target.updateMatrixWorld();
    world.sun.color.copy(s.sun);
    world.sun.intensity = s.sunI * (1 - 0.75 * rain);
    world.hemi.color.copy(s.hemi).lerp(c3('#c4c8d0'), rain * 0.5);
    world.hemi.intensity = s.hemiI * (1 - 0.18 * rain);
    grade.uniforms.tint.value.copy(s.tint);
    grade.uniforms.sat.value = s.sat * (1 - 0.22 * rain);
    finU.tint.value.copy(s.tint);
    finU.sat.value = s.sat * (1 - 0.22 * rain) * (lookName === 'classic' ? 1 : v.sat);
    // The patch: each window corner along the light onto the floor (kept inside the room)
    const pos = patchGeo.attributes.position as THREE.BufferAttribute;
    corners.forEach((c, i) => {
      // dir points towards the sun: the light goes the other way
      const t = (c.y - 0.004) / Math.max(0.05, dir.y);
      pos.setXYZ(i, Math.min(1.75, c.x - dir.x * t), 0.004, Math.max(-1.48, Math.min(1.5, c.z - dir.z * t)));
    });
    pos.needsUpdate = true;
    patchMat.color.copy(s.sun);
    patchMat.opacity = 0.2 * Math.min(1, s.sunI) * (1 - rain) * THREE.MathUtils.smoothstep(s.elev, 0.03, 0.2);
  }

  /* ---- PS1 wobble and toon light (in the materials) ---- */
  const wobble = { value: 0 };
  const inNote = (o: THREE.Object3D) => {
    for (let p: THREE.Object3D | null = o; p; p = p.parent) if (p.userData.note || p.userData.screen || p.userData.label) return true;
    return false;
  };
  function addWobble(root: THREE.Object3D) {
    root.traverse((o) => {
      if (!(o instanceof THREE.Mesh) || inNote(o)) return;
      for (const m of ([] as THREE.Material[]).concat(o.material)) prepare(m);
    });
  }
  function prepare(m: THREE.Material) {
    if (m.userData.wobble) return;
    m.userData.wobble = true;
    const lambert = m instanceof THREE.MeshLambertMaterial;
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uWobble = wobble;
      shader.vertexShader = `uniform float uWobble;\n${shader.vertexShader}`.replace(
        '#include <project_vertex>',
        `#include <project_vertex>
          if (uWobble > 0.5) {
            vec2 grid = vec2(160.0, 120.0);
            gl_Position.xy = floor(gl_Position.xy / gl_Position.w * grid + 0.5) / grid * gl_Position.w;
          }`,
      );
      if (!lambert) return;
      Object.assign(shader.uniforms, toon);
      shader.fragmentShader = `uniform float uToon;\nuniform float uSteps;\nuniform float uSoft;\nuniform vec3 uShade;\n${shader.fragmentShader}`.replace(
        '#include <aomap_fragment>',
        `#include <aomap_fragment>
          if (uToon > 0.5) {
            // The light in steps; the dark steps lean violet
            vec3 base = max(diffuseColor.rgb, vec3(0.0001));
            vec3 lit = (reflectedLight.directDiffuse + reflectedLight.indirectDiffuse) / base;
            float l = max(max(lit.r, lit.g), lit.b);
            vec3 hue = lit / max(l, 0.0001);
            float s = l * uSteps;
            float q = (floor(s) + smoothstep(0.5 - uSoft, 0.5 + uSoft, fract(s))) / uSteps;
            q = max(q, 0.6 / uSteps) * 1.08;
            vec3 shade = mix(uShade, vec3(1.0), smoothstep(0.1, 0.5, q));
            reflectedLight.directDiffuse = base * hue * q * shade;
            reflectedLight.indirectDiffuse = vec3(0.0);
          }`,
      );
    };
    m.customProgramCacheKey = () => (lambert ? 'look-l' : 'look');
    m.needsUpdate = true;
  }
  addWobble(scene);

  /** Notes and the screen: drawn again sharp on layer 1, hidden where the low-res room is in front. */
  function sharp(root: THREE.Object3D) {
    root.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      o.layers.set(1);
      for (const m of ([] as THREE.Material[]).concat(o.material)) sharpen(m);
    });
  }
  function sharpen(m: THREE.Material) {
    if (m.userData.sharp) return;
    m.userData.sharp = true;
    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, sharpU);
      shader.fragmentShader = `uniform float uSharp;\nuniform sampler2D tSceneDepth;\nuniform vec2 uSceneRes;\nuniform float uNear;\nuniform float uFar;\n${shader.fragmentShader}`.replace(
        'void main() {',
        `void main() {
          if (uSharp > 0.5) {
            float sd = texture2D(tSceneDepth, gl_FragCoord.xy / uSceneRes).x;
            float sz = (uNear * uFar) / (uFar - sd * (uFar - uNear));
            float fz = (uNear * uFar) / (uFar - gl_FragCoord.z * (uFar - uNear));
            if (fz > sz * 1.02 + 0.012) discard;
          }`,
      );
    };
    m.customProgramCacheKey = () => 'sharp';
    m.needsUpdate = true;
  }
  sharp(world.screen);
  // Printing with words on things (desk.ts: userData.label) stays readable too
  scene.traverse((o) => o.userData.label && sharp(o));
  // Lights belong to layers too: the sharp pass needs them as well
  scene.traverse((o) => (o as THREE.Light).isLight && o.layers.enableAll());

  /* ---- state ---- */
  let progress = 0;
  let shown = 0;
  let clock = 0;
  let skyClock = 0;
  let perf = { t: 0, frames: 0, done: false };
  setVariant('pixel');
  drawSky(0, 0, 0);
  applyDay(0, 0);

  return {
    /** Where the day should go (0–1); instant = jump there (loading a save). */
    setProgress(p: number, instant = false) {
      progress = THREE.MathUtils.clamp(p, 0, 1);
      if (instant) {
        shown = progress;
        applyDay(shown, rainAt(shown));
        drawSky(shown, rainAt(shown), clock);
      }
    },
    get rain() {
      return rainAt(shown);
    },
    get effects() {
      return effects;
    },
    setEffects(on: boolean) {
      effects = on;
    },
    setWobble(on: boolean) {
      wobble.value = on ? 1 : 0;
    },
    addWobble,
    sharp,
    get look() {
      return lookName;
    },
    setLook(name: LookName) {
      setVariant(LOOKS.includes(name) ? name : 'pixel');
      applyDay(shown, rainAt(shown));
    },
    /** How far away the thing in focus is (m); the rest goes soft. */
    setFocus(d: number, amount = 1) {
      focusWant = THREE.MathUtils.clamp(d, 0.1, 12);
      focusAmtWant = amount;
    },
    resize(w: number, h: number) {
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(w, h);
      bloom.resolution.set(w / 2, h / 2);
      grade.uniforms.aspect.value = w / h;
      vw = w;
      vh = h;
      const pr = renderer.getPixelRatio();
      sharpRT.setSize(Math.round(w * pr), Math.round(h * pr));
      finU.uRes.value.set(w * pr, h * pr);
      finU.aspect.value = w / h;
      sharpU.uSceneRes.value.set(Math.round(w * pr), Math.round(h * pr));
      if (lookName !== 'classic') sizeLow();
    },
    /** Moves the day on, animates the sky; then draws the frame. */
    render(dt: number) {
      clock += dt;
      grade.uniforms.time.value = clock;
      finU.time.value = clock;
      focus += (focusWant - focus) * Math.min(1, dt * 6);
      focusAmt += (focusAmtWant - focusAmt) * Math.min(1, dt * 4);
      if (Math.abs(shown - progress) > 0.0005) {
        shown += (progress - shown) * Math.min(1, dt * 0.8);
        applyDay(shown, rainAt(shown));
      }
      skyClock += dt;
      if (skyClock > 0.12) {
        skyClock = 0;
        drawSky(shown, rainAt(shown), clock);
      }
      // Slow device: first no bloom, then no post at all
      if (!perf.done && dt > 0) {
        perf.t += dt;
        perf.frames++;
        if (perf.t > 3) {
          const fps = perf.frames / perf.t;
          if (fps < 40) {
            bloom.enabled = false;
            fxLite = true;
          }
          if (fps < 26) effects = false;
          perf = { t: 0, frames: 0, done: fps >= 40 || !effects };
        }
      }
      if (!effects) renderer.render(scene, camera);
      else if (lookName === 'classic') composer.render(dt);
      else renderNew();
    },
  };
}

export type Look = ReturnType<typeof createLook>;
