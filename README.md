# runkids — 3D Model Viewer

A small web app for viewing 3D models in the browser. Drag a file in and
orbit, zoom, and pan around it — no plugins, no uploads to a server.

Built with **Vite + React + [react-three-fiber](https://docs.pmnd.rs/react-three-fiber)**
on top of [Three.js](https://threejs.org/).

## Features

- Loads **glTF / GLB**, **OBJ**, **STL**, and **FBX** models.
- **Drag & drop** any model onto the window, or click **Open model file**.
- Models auto-center and auto-scale to fit the view.
- Orbit / zoom / pan controls, soft lighting, environment reflections, a grid floor.
- Optional bundled model library via `public/models/manifest.json`.
- Everything runs client-side — dropped files never leave your machine.

## Getting started

```bash
npm install
npm run dev
```

Then open the URL Vite prints (default <http://localhost:5173>).

Don't have a model handy? Grab a sample `.glb` such as the
[Khronos glTF sample models](https://github.com/KhronosGroup/glTF-Sample-Assets)
and drag it onto the window.

## Bundling your own models

Put model files in `public/models/` and list them in
`public/models/manifest.json`:

```json
[{ "name": "Robot", "file": "robot.glb" }]
```

They'll show up under **Included** in the sidebar. See
`public/models/README.md` for details. Self-contained `.glb` files are the
simplest to bundle.

## Build

```bash
npm run build    # outputs to dist/
npm run preview  # serve the production build locally
```

## Project layout

```
index.html            App entry
src/
  main.tsx            React bootstrap
  App.tsx             Layout, sidebar, drag & drop, canvas
  Model.tsx           Format detection + loaders + auto-fit
  styles.css          UI styling
public/models/        Optional bundled models + manifest.json
```

## Notes

- `.gltf` files that reference external `.bin`/textures need those companion
  files alongside them (bundled in `public/models/`). Single-file `.glb`
  avoids this.
- The Three.js bundle is large by nature; the production build warns about
  chunk size. Code-splitting the loaders is a possible future optimization.
