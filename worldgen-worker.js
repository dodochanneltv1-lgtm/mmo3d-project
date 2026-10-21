const TOWNS = [
  { x: 0, z: 0, radius: 124, groundColor: 0xe7e5e4 },
  { x: -260, z: -260, radius: 124, groundColor: 0xd1fae5 },
  { x: 260, z: -240, radius: 124, groundColor: 0xfed7aa },
  { x: -240, z: 260, radius: 124, groundColor: 0xe0f2fe }
];
const WATER_LEVEL = 0;

function seedFromString(seedStr) {
  const value = String(seedStr || 'AETHELGARD-RP-01');
  let hash = 1779033703 ^ value.length;
  for (let i = 0; i < value.length; i++) {
    hash = Math.imul(hash ^ value.charCodeAt(i), 3432918353);
    hash = (hash << 13) | (hash >>> 19);
  }
  return (hash >>> 0) || 123456789;
}

function hash2D(ix, iz, seed) {
  let value = Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(seed, 1442695041);
  value = (value ^ (value >>> 13)) * 1274126177;
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

function smoothNoise(x, z, seed) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx);
  const v = fz * fz * (3 - 2 * fz);
  const a = hash2D(ix, iz, seed);
  const b = hash2D(ix + 1, iz, seed);
  const c = hash2D(ix, iz + 1, seed);
  const d = hash2D(ix + 1, iz + 1, seed);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

function getHeight(x, z, seed) {
  let value = 0, amplitude = 1, frequency = 0.015, maxAmplitude = 0;
  for (let octave = 0; octave < 4; octave++) {
    value += smoothNoise(x * frequency, z * frequency, seed) * amplitude;
    maxAmplitude += amplitude;
    amplitude *= 0.5;
    frequency *= 2.02;
  }
  let height = (value / maxAmplitude - 0.43) * 16;
  for (const town of TOWNS) {
    const distance = Math.hypot(x - town.x, z - town.z);
    if (distance <= town.radius + 6) return 0.6;
    if (distance < town.radius + 26) {
      const blend = Math.max(0, Math.min(1, (distance - (town.radius + 6)) / 20));
      const smooth = blend * blend * (3 - 2 * blend);
      height = height * smooth + 0.6 * (1 - smooth);
    }
  }
  return height;
}

function toLinearColor(hex) {
  const convert = (channel) => {
    const srgb = channel / 255;
    return srgb <= 0.04045 ? srgb / 12.92 : Math.pow((srgb + 0.055) / 1.055, 2.4);
  };
  return [convert((hex >> 16) & 255), convert((hex >> 8) & 255), convert(hex & 255)];
}

self.addEventListener('message', (event) => {
  const { id, cx, cz, chunkSize, localCoordinates, seedStr } = event.data;
  try {
    const heights = new Float32Array(localCoordinates.length / 2);
    const colors = new Float32Array(localCoordinates.length / 2 * 3);
    const seed = seedFromString(seedStr);

    for (let i = 0; i < heights.length; i++) {
      const x = localCoordinates[i * 2] + cx * chunkSize;
      const z = localCoordinates[i * 2 + 1] + cz * chunkSize;
      const height = getHeight(x, z, seed);
      heights[i] = height;

      let color = null;
      for (const town of TOWNS) {
        if (Math.hypot(x - town.x, z - town.z) < town.radius) {
          color = toLinearColor(town.groundColor);
          break;
        }
      }
      if (!color) {
        const hex = height < WATER_LEVEL + 0.45 ? 0xeab308
          : x < -55 && z < -55 ? 0x15803d
            : x > 55 && z < -45 ? 0xc2410c
              : x < -45 && z > 55 ? 0xcbd5e1
                : height > 3.8 ? 0x64748b : 0x22c55e;
        color = toLinearColor(hex);
      }

      const shade = Math.max(0.62, Math.min(1.06, 0.76 + (height + 2.0) * 0.032));
      colors[i * 3] = color[0] * shade;
      colors[i * 3 + 1] = color[1] * shade;
      colors[i * 3 + 2] = color[2] * shade;
    }

    self.postMessage({ id, heights, colors }, [heights.buffer, colors.buffer]);
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
});
