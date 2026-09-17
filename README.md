# 3D Educational Manual Gearbox & Drivetrain Simulator

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Build & Test](https://img.shields.io/badge/tests-174%20passed-brightgreen.svg)](tests/test_gearbox.ts)
[![Vercel Deployment](https://img.shields.io/badge/deployment-live%20on%20vercel-00e5ff.svg)](https://gearbox-drivetrain-simulator.vercel.app/)

An interactive 3D web-based engineering simulator demonstrating the internal kinematics and physics of a **3-shaft constant-mesh manual transmission** and automotive drivetrain.

🌐 **Live Demo**: [https://gearbox-drivetrain-simulator.vercel.app/](https://gearbox-drivetrain-simulator.vercel.app/)  
📂 **GitHub Repository**: [https://github.com/NamanSahai/gearbox-drivetrain-simulator](https://github.com/NamanSahai/gearbox-drivetrain-simulator)

---

## Features

### 1. Interactive 3D Constant-Mesh Assembly
- **18 Educational Components**: Flywheel, Clutch Friction Disc, Pressure Plate, Release Bearing, Input Shaft & Pinion, Countershaft (Layshaft), 1st–5th Gear Pairs, Reverse Idler, Synchronizer Sleeves (1/2, 3/4, 5/R), Selector Forks, Transmission Casing, and Differential.
- **Physical Dog-Tooth Engagement**: Watch synchronizer sleeves and balk rings physically slide into mesh with speed gear dog teeth as you shift gears.
- **True Mechanical Kinematics**: Shafts, countershaft gears, and free-spinning speed gears rotate in real-time according to exact reduction ratios.
- **Obstruction-Free Raycasting**: Smart raycaster prioritizes internal gears, synchronizers, and shafts even when viewing through transparent or cutaway casings.

### 2. Augmented Reality (AR) with Real-World Surface Tracking
- **Interactive 3D Part Clicking in AR**: Tap directly on any 3D gear or shaft in your physical environment to select, highlight, and inspect it.
- **Rich AR Educational Inspector**:
  - Full parity with web inspect mode: displays **Category**, **Component Name**, **1 / 18 Index Badge**, **Primary Function**, **Power Flow Role**, and **Engineering Note**.
  - Integrated navigation controls: **[ ◀ Prev ]**, native **Dropdown `<select>`** (all 18 parts), and **[ Next ▶ ]** buttons.
  - **Minimize / Expand** toggle to collapse the panel for unobstructed 3D viewing.
- **Universal Web Camera AR (iOS / iPhone Safari & Mobile Web)**:
  - Streams rear-camera video feed behind the transparent 3D canvas so iPhone users stay in the interactive web app with full clickability and live gear shifting.
- **WebXR Immersive-AR (Android Chrome)**:
  - Real-world planar surface hit-testing, reticle targeting, and contact shadow receiver plane.
- **Scale Presets & Controls**:
  - **Tabletop (0.35x)** for desk inspection and **Floor (1:1 Life-Size)** for room/garage scale.
  - Live AR Quick Shifter (`R`, `1`, `2`, `3`, `4`, `5`, `N`) and ↺ 15° / ↻ 15° rotation controls.
- **Apple Quick Look (USDZ)**: Optional direct export for native Apple ARKit plane locking.

### 3. Transmission Casing Modes & Exploded View
- **4 Casing Display Modes**:
  - **Cutaway**: Transparent top/side with metallic aluminum structural ribs.
  - **Solid**: Fully enclosed aluminum casting with cast texture.
  - **Wireframe**: Holographic CAD structural mesh.
  - **Hidden**: Casing completely hidden for pure gear train inspection.
- **Exploded View**: Interactive slider to axially separate transmission components along their shaft centerlines for internal inspection.

### 4. Drivetrain Kinematics & Physical Failures
- **Gear Ratios**:
  - 1st Gear: `3.60:1` (High torque launch)
  - 2nd Gear: `2.10:1` (Intermediate acceleration)
  - 3rd Gear: `1.40:1` (City cruising)
  - 4th Gear: `1.00:1` (Direct Drive — countershaft unloaded)
  - 5th Gear: `0.78:1` (Overdrive — highway economy)
  - Reverse: `3.40:1` (Reverse idler changes rotation direction)
  - Differential Final Drive: `3.90:1`
- **Interactive Scenarios & Fail-safes**:
  - **The Money Shift Disaster**: Shifting from 5th to 1st at 110 km/h forces RPM to ~13,000, triggering catastrophic mechanical destruction with animated exploding shards and sparks.
  - **Clutch Dump Engine Stall**: Releasing clutch at low RPM without throttle stalls the engine.
  - **Gear Grinding**: Shifting without depressing clutch triggers dog tooth clash and audible grinding feedback.

---

## Tech Stack

- **Three.js** (WebGL 3D rendering, materials, shadows, raycasting, and animations)
- **WebXR Device API** (AR surface hit-testing and DOM overlay)
- **HTML5 getUserMedia API** (Universal Web Camera AR passthrough)
- **Three.js USDZExporter** (Apple AR Quick Look integration)
- **TypeScript** & **Vite** (Type-safe compilation and ultra-fast bundling)
- **Web Audio API** (Procedural engine RPM audio, gear shift clicks, and grind effects)

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher)
- npm

### Installation

```bash
git clone https://github.com/NamanSahai/gearbox-drivetrain-simulator.git
cd gearbox-drivetrain-simulator
npm install
```

### Development Server

```bash
npm run dev
```

The Vite dev server starts with HTTPS support. Open the URL in your browser or scan the high-contrast QR code on your mobile device to test AR mode.

### Running Tests

Run the automated test suite (174 mechanical, kinematic, and UI assertions):

```bash
npm test
```

### Production Build

```bash
npm run build
```

The optimized static assets will be output to the `dist/` directory, ready for deployment to Vercel, Netlify, or GitHub Pages.

---

## License

This project is open source and available under the [MIT License](LICENSE).  
Copyright (c) 2025 Naman Sahai.

