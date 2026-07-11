uniform float uTime;
uniform vec3 uCam;
uniform float uBrightness;

varying vec3 vWorld;

void main() {
  vec2 cell = vWorld.xz * 0.22;
  vec2 g = abs(fract(cell) - 0.5) / fwidth(cell);
  float line = 1.0 - min(min(g.x, g.y), 1.0);

  float dist = distance(vWorld.xz, uCam.xz);
  float fade = exp(-dist * 0.020);

  // Traveling energy wave along the floor
  float wave = sin(dist * 0.14 - uTime * 1.6) * 0.5 + 0.5;

  vec3 col = mix(vec3(0.04, 0.35, 0.55), vec3(0.32, 0.18, 0.75), clamp(vWorld.z * -0.004, 0.0, 1.0));
  col *= line * fade * (0.55 + 0.9 * wave) * uBrightness;

  gl_FragColor = vec4(col, 1.0);
}
