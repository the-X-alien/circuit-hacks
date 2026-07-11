uniform float uTime;

attribute float aPhase;
attribute float aHue;

varying float vY;
varying float vHue;
varying float vDist;

void main() {
  vY = clamp(position.y / 0.9 + 0.5, 0.0, 1.0);
  vHue = aHue;

  vec3 p = position;
  float bob = sin(uTime * 2.1 + aPhase) * 0.055;
  float sway = sin(uTime * 1.3 + aPhase * 1.7) * 0.05;
  p.y += bob * vY;
  p.x += sway * vY;

  vec4 w = modelMatrix * instanceMatrix * vec4(p, 1.0);
  vec4 mv = viewMatrix * w;
  vDist = -mv.z;
  gl_Position = projectionMatrix * mv;
}
