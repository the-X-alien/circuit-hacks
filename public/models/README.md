# Board model

The circuit-board flythrough (`src/components/experience/scenes/CircuitWorld.ts`)
loads a real board model from this folder:

    public/models/circuit-board.glb

## Current model

`circuit-board.glb` — "The Long Graphics Card PCB" by Gone U, **CC BY 3.0**
(attribution required — it is in the site footer). Source: https://poly.pizza/m/7IAF3hGUe6N

To swap it, replace `circuit-board.glb` with any other `.glb` board model. The
site also works without the file — it falls back to the procedural board.

## Tuning (in CircuitWorld.ts)

- `MODEL_ROTATE_X` — set to `Math.PI / 2` (or `-Math.PI / 2`) if the board loads
  standing on its edge instead of lying flat.
- `MODEL_FOOTPRINT` — how wide the board is scaled across the corridor.

## License / attribution

CC BY 4.0 requires credit. It is already in the site footer:
"Circuit board model by Flikd Design, licensed under CC BY 4.0."
Keep that line if you keep the model.
