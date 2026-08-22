# Bundled models

Drop 3D model files here to have them appear in the viewer's **Included** list
automatically.

Supported formats: `.glb`, `.gltf`, `.obj`, `.stl`, `.fbx`.

Then list them in `manifest.json`:

```json
[
  { "name": "Robot", "file": "robot.glb" },
  { "name": "Chair", "file": "chair.obj" }
]
```

- `name` — the label shown in the sidebar.
- `file` — the filename relative to this folder.

> Note: `.gltf` files that reference external `.bin`/texture files need those
> companion files placed here too. Self-contained `.glb` files are the easiest.

You don't need to touch this at all to try the viewer — you can also just drag
any model file onto the app window, or click **Open model file**.
