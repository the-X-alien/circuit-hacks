uniform float uTime;
uniform float uProgress; // 0 = chaos, 1 = assembled glyph
uniform float uScatter;  // scroll-driven dispersal
uniform vec2 uPointer;   // NDC
uniform float uPixelRatio;

attribute vec3 aStart;
attribute vec3 aTarget;
attribute float aRand;

varying float vMix;
varying float vAlpha;

vec3 wobble(vec3 p, float t, float r) {
  return vec3(
    sin(t * 0.6 + r * 17.0 + p.y * 0.8),
    cos(t * 0.5 + r * 23.0 + p.x * 0.7),
    sin(t * 0.7 + r * 11.0 + p.z * 0.9)
  );
}

void main() {
  vec3 pos = mix(aStart, aTarget, uProgress);
  pos += wobble(pos, uTime, aRand) * mix(0.55, 0.05, uProgress);

  // Scatter: particles fly outward and past the camera as the user scrolls
  vec3 dir = normalize(pos + vec3(0.0001, 0.0002, 0.0003));
  pos += dir * uScatter * (6.0 + aRand * 18.0);
  pos.z += uScatter * (12.0 + aRand * 24.0);

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);

  // Pointer repulsion in view space
  vec2 scr = mv.xy / max(0.001, -mv.z);
  float d = distance(scr, uPointer * 0.55);
  float force = smoothstep(0.28, 0.0, d);
  mv.xy += normalize(scr - uPointer * 0.55 + 0.0001) * force * 1.4;

  gl_Position = projectionMatrix * mv;
  gl_PointSize = (1.1 + aRand * 2.4) * uPixelRatio * (30.0 / max(0.001, -mv.z));

  vMix = aRand;
  vAlpha = (0.5 + 0.5 * sin(uTime * (0.4 + aRand * 0.8) + aRand * 40.0)) * (1.0 - uScatter * 0.9);
}
