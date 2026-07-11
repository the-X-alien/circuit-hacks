attribute float aHeight; // normalized 0..1
attribute float aSeed;

varying float vH;
varying float vY;
varying vec3 vWorld;
varying float vSeed;

void main() {
  vY = position.y + 0.5; // BoxGeometry y in [-0.5, 0.5]
  vH = aHeight;
  vSeed = aSeed;
  vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
