import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// 1. ระบบ Post-Processing Reshade ที่เน้นมิติแสงเงาและเฉดสีคมชัด (ไม่ขาวโพลนแสบตา)
export function setupReshadePostProcessing(renderer, scene, camera) {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;

  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  // ตั้ง threshold สูง (1.15) เพื่อให้เรืองแสงเฉพาะเปลวไฟและเวทมนตร์ ไม่ทำให้ฉากหรือตัวละครขาวโพลน
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.16, // strength นุ่มนวล
    0.45, // radius
    1.15  // threshold สูง ป้องกันแสงฟุ้งแสบตา
  );
  composer.addPass(bloomPass);

  // ฟิลเตอร์ไล่เฉดแสงเงา (Shadow Depth, Ambient Contrast & Color Balance)
  const ReshadeShader = {
    uniforms: {
      tDiffuse: { value: null },
      uSaturation: { value: 1.16 },
      uContrast: { value: 1.12 },
      uShadowTint: { value: new THREE.Vector3(0.90, 0.93, 1.04) },
      uHighlightTint: { value: new THREE.Vector3(1.03, 1.01, 0.96) },
      uVignette: { value: 0.24 }
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D tDiffuse;
      uniform float uSaturation;
      uniform float uContrast;
      uniform vec3 uShadowTint;
      uniform vec3 uHighlightTint;
      uniform float uVignette;
      varying vec2 vUv;

      void main() {
        vec4 texel = texture2D(tDiffuse, vUv);
        vec3 col = texel.rgb;

        float luma = dot(col, vec3(0.299, 0.587, 0.114));

        // แยกเฉดเงา (Cool Shadow) และเฉดแสงสว่าง (Warm Sunlight) เพื่อเพิ่มมิติความลึก
        vec3 shadowCol = col * uShadowTint;
        vec3 highCol = col * uHighlightTint;
        col = mix(shadowCol, highCol, smoothstep(0.15, 0.75, luma));

        // ปรับความอิ่มสีและความต่างระดับแสงเงา
        col = mix(vec3(luma), col, uSaturation);
        col = clamp((col - 0.48) * uContrast + 0.48, 0.0, 1.0);

        // ขอบจอนุ่มนวลช่วยให้ภาพมีมิติ
        vec2 centered = vUv - 0.5;
        float vig = 1.0 - dot(centered, centered) * uVignette;
        col *= clamp(vig, 0.0, 1.0);

        gl_FragColor = vec4(col, texel.a);
      }
    `
  };

  const reshadePass = new ShaderPass(ReshadeShader);
  composer.addPass(reshadePass);

  const outputPass = new OutputPass();
  composer.addPass(outputPass);

  const presets = [
    { name: 'Anime Cel-Depth', bloom: 0.14, sat: 1.18, con: 1.14, vig: 0.24, exp: 0.90 },
    { name: 'Soft Sunset Shade', bloom: 0.18, sat: 1.24, con: 1.16, vig: 0.28, exp: 0.88 },
    { name: 'Crisp Natural Shadow', bloom: 0.05, sat: 1.12, con: 1.10, vig: 0.18, exp: 0.92 },
    { name: 'Dark Fantasy Contrast', bloom: 0.16, sat: 1.08, con: 1.24, vig: 0.36, exp: 0.82 }
  ];
  let presetIndex = 0;

  return {
    composer,
    bloomPass,
    reshadePass,
    cyclePreset() {
      presetIndex = (presetIndex + 1) % presets.length;
      const p = presets[presetIndex];
      bloomPass.strength = p.bloom;
      reshadePass.uniforms.uSaturation.value = p.sat;
      reshadePass.uniforms.uContrast.value = p.con;
      reshadePass.uniforms.uVignette.value = p.vig;
      renderer.toneMappingExposure = p.exp;
      return p.name;
    },
    setSize(w, h) {
      composer.setSize(w, h);
      bloomPass.resolution.set(w, h);
    }
  };
}

// 2. วัสดุ Anime Cel-Shader ที่มีมิติแสงเงา (3-Band Toon Shading + Subtle Rim Light)
export function createAnimeMaterial(params = {}) {
  const isSkin = !!params.isSkin;
  const mat = new THREE.MeshStandardMaterial({
    color: params.color ?? 0xffffff,
    roughness: params.roughness ?? (isSkin ? 0.72 : 0.55),
    metalness: params.metalness ?? (isSkin ? 0.0 : 0.10),
    map: params.map ?? null,
    emissive: params.emissive ?? 0x000000,
    emissiveIntensity: params.emissiveIntensity ?? 0.0,
    side: params.side ?? THREE.FrontSide
  });

  const rimColor = new THREE.Color(params.rimColor ?? (isSkin ? 0xffe4d6 : 0xbae6fd));
  const rimStrength = params.rimStrength ?? (isSkin ? 0.12 : 0.18);

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uRimColor = { value: rimColor };
    shader.uniforms.uRimStrength = { value: rimStrength };
    shader.uniforms.uIsSkin = { value: isSkin ? 1.0 : 0.0 };

    shader.fragmentShader = `
      uniform vec3 uRimColor;
      uniform float uRimStrength;
      uniform float uIsSkin;
    ` + shader.fragmentShader;

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <dithering_fragment>',
      `
      if (uIsSkin > 0.5) {
        // เงาผิวอนิเมะอมพีชอบอุ่น มีมิติบริเวณใต้คางและข้างแก้ม
        vec3 peachShadow = diffuseColor.rgb * vec3(0.84, 0.71, 0.68);
        float skinLum = dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114));
        gl_FragColor.rgb = mix(peachShadow, gl_FragColor.rgb, smoothstep(0.18, 0.55, skinLum));
      } else {
        // ไล่ระดับแสงเงา 3 ขั้น (Highlight / Midtone / Deep Shadow) ให้เห็นรูปทรงชัดเจน
        float lum = dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114));
        float shadowStep = smoothstep(0.16, 0.24, lum) * 0.22 + smoothstep(0.45, 0.55, lum) * 0.14 + 0.68;
        gl_FragColor.rgb *= shadowStep;
      }
      float rim = 1.0 - max(dot(normalize(vViewPosition), normalize(normal)), 0.0);
      rim = smoothstep(0.68, 0.98, rim);
      gl_FragColor.rgb += uRimColor * rim * uRimStrength;
      #include <dithering_fragment>
      `
    );
  };
  return mat;
}

// 3. Texture หมอกเปลวไฟฟุ้งนุ่มนวลสำหรับกองไฟ (Volumetric Mist Flame Particle)
let cachedMistTex = null;
export function getVolumetricMistTexture() {
  if (cachedMistTex) return cachedMistTex;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(64, 64, 4, 64, 64, 60);
  grad.addColorStop(0.0, 'rgba(255, 255, 240, 1.0)');
  grad.addColorStop(0.3, 'rgba(255, 180, 60, 0.85)');
  grad.addColorStop(0.65, 'rgba(249, 115, 22, 0.42)');
  grad.addColorStop(1.0, 'rgba(234, 88, 12, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  cachedMistTex = new THREE.CanvasTexture(canvas);
  return cachedMistTex;
}

// 4. Custom GLSL Water Shader
export function createWaterShaderMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    uniforms: {
      uTime: { value: 0 },
      uPlayerPos: { value: new THREE.Vector3() },
      uSunDir: { value: new THREE.Vector3(0.5, 0.8, 0.3) },
      uDayFactor: { value: 1.0 }
    },
    vertexShader: `
      uniform float uTime;
      varying vec3 vWorldPos;
      varying float vWaveHeight;

      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        float w1 = sin(worldPosition.x * 0.35 + uTime * 2.2) * 0.14;
        float w2 = cos(worldPosition.z * 0.42 + uTime * 1.8) * 0.12;
        float w3 = sin((worldPosition.x + worldPosition.z) * 0.25 - uTime * 1.4) * 0.08;
        worldPosition.y += w1 + w2 + w3;
        vWorldPos = worldPosition.xyz;
        vWaveHeight = w1 + w2 + w3;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uPlayerPos;
      uniform float uDayFactor;
      varying vec3 vWorldPos;
      varying float vWaveHeight;

      void main() {
        vec3 deepColor = mix(vec3(0.02, 0.09, 0.22), vec3(0.04, 0.36, 0.64), uDayFactor);
        vec3 shallowColor = mix(vec3(0.05, 0.20, 0.38), vec3(0.16, 0.68, 0.86), uDayFactor);
        vec3 col = mix(deepColor, shallowColor, smoothstep(-0.24, 0.26, vWaveHeight));

        float distToPlayer = length(vWorldPos.xz - uPlayerPos.xz);
        if (distToPlayer < 4.2 && uPlayerPos.y < -1.0) {
          float ripple = sin(distToPlayer * 6.5 - uTime * 8.5);
          float foamMask = smoothstep(0.55, 0.95, ripple) * (1.0 - distToPlayer / 4.2);
          col = mix(col, vec3(0.92, 0.96, 1.0), foamMask * 0.85);
        }

        float sparkle = smoothstep(0.22, 0.32, vWaveHeight);
        col += vec3(0.30, 0.40, 0.50) * sparkle * uDayFactor;

        gl_FragColor = vec4(col, 0.86);
      }
    `
  });
}

// 5. Custom GLSL Sky Dome Shader
export function createSkyDomeShader() {
  // Local-space direction keeps the sky gradient stable as the player moves.
  const vertexShader = `
    varying vec3 vSkyDirection;
    void main() {
      vSkyDirection = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      gl_Position.z = gl_Position.w * 0.99999;
    }
  `;
  const fragmentShader = `
    uniform float uDayFactor;
    uniform float uSunsetFactor;
    uniform float uTime;
    varying vec3 vSkyDirection;
    float random(vec2 st) { return fract(sin(dot(st, vec2(12.9898, 78.233))) * 43758.5453123); }
    void main() {
      vec3 dir = normalize(vSkyDirection);
      float y = clamp(dir.y, 0.0, 1.0);
      vec3 daySky = mix(vec3(0.55, 0.82, 0.98), vec3(0.08, 0.32, 0.76), smoothstep(0.0, 1.0, y));
      vec3 sunsetSky = mix(vec3(1.0, 0.52, 0.28), vec3(0.42, 0.20, 0.48), smoothstep(0.0, 1.0, y));
      vec3 nightSky = mix(vec3(0.035, 0.075, 0.16), vec3(0.008, 0.018, 0.065), smoothstep(0.0, 0.85, y));
      vec3 finalSkyColor = mix(nightSky, daySky, clamp(uDayFactor, 0.0, 1.0));
      finalSkyColor = mix(finalSkyColor, sunsetSky, clamp(uSunsetFactor * (1.0 - uDayFactor * 0.4), 0.0, 1.0));
      if (uDayFactor < 0.48 && y > 0.08) {
        vec2 starUV = dir.xz / max(0.12, dir.y + 0.18);
        vec2 cell = floor(starUV * 180.0);
        float rnd = random(cell);
        if (rnd > 0.993) {
          vec2 local = fract(starUV * 180.0) - 0.5;
          float star = 1.0 - smoothstep(0.025, 0.09, length(local));
          float twinkle = 0.65 + 0.35 * sin(uTime * 2.2 + rnd * 80.0);
          float visibility = 1.0 - smoothstep(0.0, 0.48, uDayFactor);
          finalSkyColor += vec3(0.75, 0.86, 1.0) * star * twinkle * visibility * 0.8;
        }
      }
      gl_FragColor = vec4(finalSkyColor, 1.0);
    }
  `;
  return new THREE.ShaderMaterial({
    vertexShader, fragmentShader,
    uniforms: { uDayFactor: { value: 1.0 }, uSunsetFactor: { value: 0.0 }, uTime: { value: 0.0 } },
    side: THREE.BackSide, depthWrite: false, depthTest: false, toneMapped: false, fog: false
  });
}

// วางเพิ่มในไฟล์ shaders.js
let cachedSoftGlowTex = null;
export function getSoftGlowTexture() {
  if (cachedSoftGlowTex) return cachedSoftGlowTex;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(64, 64, 2, 64, 64, 62);
  grad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
  grad.addColorStop(0.35, 'rgba(254, 240, 138, 0.75)');
  grad.addColorStop(0.7, 'rgba(251, 191, 36, 0.25)');
  grad.addColorStop(1.0, 'rgba(251, 191, 36, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  cachedSoftGlowTex = new THREE.CanvasTexture(canvas);
  return cachedSoftGlowTex;
}