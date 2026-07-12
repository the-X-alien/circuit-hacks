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

  // Blue → Gold → Bronze gradient across the floor
  vec3 blue = vec3(0.44, 0.66, 0.84);
  vec3 gold = vec3(0.90, 0.71, 0.29);
  vec3 bronze = vec3(0.74, 0.52, 0.31);
  float grad = clamp(vWorld.z * -0.004, 0.0, 1.0);
  vec3 col = mix(mix(blue, gold, grad * 2.0), bronze, max(0.0, grad * 3.0 - 1.0));
  col *= line * fade * (0.55 + 0.9 * wave) * uBrightness;

  gl_FragColor = vec4(col, 1.0);
}
