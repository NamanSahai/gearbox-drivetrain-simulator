# 3D Educational Manual Gearbox & Drivetrain Simulator

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Build & Test](https://img.shields.io/badge/tests-196%20passed-brightgreen.svg)](tests/test_gearbox.ts)
[![Vercel Deployment](https://img.shields.io/badge/deployment-live%20on%20vercel-00e5ff.svg)](https://gearbox-drivetrain-simulator.vercel.app/)

An interactive 3D web-based engineering simulator demonstrating the internal kinematics, physics, and real-world mechanics of a **3-shaft constant-mesh manual transmission** and automotive drivetrain.

🌐 **Live Demo**: [https://gearbox-drivetrain-simulator.vercel.app/](https://gearbox-drivetrain-simulator.vercel.app/)  
📂 **GitHub Repository**: [https://github.com/NamanSahai/gearbox-drivetrain-simulator](https://github.com/NamanSahai/gearbox-drivetrain-simulator)

---

## Key Features

### 1. Real-World Sequential Gearbox Mechanics & Dynamics (1 → 2 → 3 → 4 → 5)
- **Authentic Launch Mechanics**:
  - In real life, an internal combustion engine cannot launch a vehicle from a standstill (0 km/h) in tall gears (5th, 4th, 3rd, or 2nd) due to insufficient torque multiplication.
  - Attempting to take off directly in 5th gear at 0 km/h bogs down and **stalls the engine** (`ENGINE STALLED — 5th gear is too tall (0.78:1) to launch from a stop! Start in 1st gear.`), keeping vehicle speed at 0 km/h.
  - Launching from rest requires **1st Gear** (3.60:1 reduction, 13.43:1 overall with final drive), smoothly pulling from 0 to 25 km/h as engine RPM climbs from 800 RPM idle up to ~2,950 RPM.
- **Continuous Velocity Across Shifts**:
  - Zero instant velocity jumps or teleportation. Road speed remains continuous across shifts, faithfully obeying vehicle inertia.
  - Upshifting sequentially (1→2→3→4→5) drops engine RPM to mathematically matched ratios (`forcedEngineRpm`), then smoothly accelerates through each gear's natural speed band:
    - **1st Gear**: `0 – 25 km/h` (800 → 2,950 RPM) — High torque launch
    - **2nd Gear**: `25 – 48 km/h` (1,750 → 3,250 RPM) — Intermediate acceleration
    - **3rd Gear**: `48 – 72 km/h` (2,150 → 3,250 RPM) — City cruising
    - **4th Gear**: `72 – 96 km/h` (2,300 → 3,100 RPM) — Direct Drive (1:1 lockup)
    - **5th Gear**: `96 – 125+ km/h` (2,400 → 3,000 RPM) — Overdrive highway cruising
    - **Reverse**: `0 to -16 km/h` (800 → 2,200 RPM) — Reverse idler inverts rotation
- **Engine Braking & Anti-Stall Protection**:
  - Downshifting at speed safely engages engine braking, bringing road speed down toward the lower gear's operating range while raising RPM.
  - Shifting into an excessively tall gear while moving at low speed (e.g. into 5th at 10 km/h) drops RPM below 550 RPM and realistically stalls the engine.
  - Selecting 1st gear or Neutral while stalled automatically restarts the engine and resets stall flags.

### 2. Physical Failures & Catastrophic Destruction
- **The Money Shift**:
  - Downshifting from 5th (or 4th at high speed) directly into 1st gear forces the engine to ~13,000 RPM—deep into catastrophic valve-float and centrifugal clutch burst territory.
  - Triggers physical failure animations: 42 jagged metal shards, 180 high-velocity sparks, bellhousing smoke, and an audible explosion.
- **Reverse Clash**:
  - Shifting into Reverse while traveling forward at speed (> 25 km/h) shears the reverse idler gear against forward-spinning mainshaft teeth, triggering transmission destruction.
- **Compact Top-Bar Repair Button**:
  - Sleek, compact `.icon-btn` located in the header right next to the **AR View** button, styled with subtle transparent crimson and a soft glowing pulse that only appears when destroyed.
  - Clicking **Repair** rebuilds the transmission, dissolves debris shards, clears smoke, and idles the engine safely in Neutral.
  - Includes an AR-native `#btn-ar-repair` button in the WebXR overlay header so users can repair without leaving their AR session.

### 3. Augmented Reality (AR) with Real-World Surface Tracking
- **Interactive 3D Part Clicking in AR**: Tap directly on any 3D gear or shaft in your physical environment to select, highlight, and inspect it.
- **Rich AR Component Inspector**:
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

### 4. Interactive 3D Constant-Mesh Assembly
- **18 Educational Components**: Flywheel, Clutch Friction Disc, Pressure Plate, Release Bearing, Input Shaft & Pinion, Countershaft (Layshaft), 1st–5th Gear Pairs, Reverse Idler, Synchronizer Sleeves (1/2, 3/4, 5/R), Selector Forks, Transmission Casing, and Differential.
- **Physical Dog-Tooth Engagement**: Watch synchronizer sleeves and balk rings physically slide into mesh with speed gear dog teeth as you shift gears.
- **True Mechanical Kinematics**: Shafts, countershaft gears, and free-spinning speed gears rotate in real-time according to exact reduction ratios.
- **Obstruction-Free Raycasting**: Smart raycaster prioritizes internal gears, synchronizers, and shafts even when viewing through transparent or cutaway casings.

### 5. Transmission Casing Modes & Exploded View
- **4 Casing Display Modes**:
  - **Cutaway**: Transparent top/side with metallic aluminum structural ribs.
  - **Solid**: Fully enclosed aluminum casting with cast texture.
  - **Wireframe**: Holographic CAD structural mesh.
  - **Hidden**: Casing completely hidden for pure gear train inspection.
- **Exploded View**: Interactive slider to axially separate transmission components along their shaft centerlines for internal inspection.

---

## Gearbox Specifications & Kinematics

| Gear | Ratio | Tooth Count (Counter / Main) | Total Reduction (with 3.73 Final Drive) | Speed Range (km/h) | Shift RPM Drop (to new gear) |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **1st** | 3.60:1 | 17T / 38T | 13.43:1 | 0 – 25 | Launch from 800 RPM |
| **2nd** | 2.10:1 | 23T / 30T | 7.83:1 | 25 – 48 | ~2,950 → ~1,750 RPM |
| **3rd** | 1.40:1 | 23T / 20T | 5.22:1 | 48 – 72 | ~3,250 → ~2,150 RPM |
| **4th** | 1.00:1 | Direct Lockup | 3.73:1 | 72 – 96 | ~3,250 → ~2,300 RPM |
| **5th** | 0.78:1 | 33T / 16T | 2.91:1 | 96 – 125+ | ~3,100 → ~2,400 RPM |
| **Rev** | 3.40:1 | 18T / 38T (via Idler) | 12.68:1 | 0 to -16 | Reverse launch |

- **Drive Pinion / Counter Drive**: `18T / 29T` (1.611:1 primary reduction)
- **Tire Radius**: `0.31 m` (Standard passenger car 205/55R16)
- **Final Drive Ratio**: `3.73:1`
- **Redline**: `6,500 RPM` (Catastrophic Money Shift at > 8,200 RPM)

---

## Tech Stack

- **Three.js** (WebGL 3D rendering, PBR materials, shadows, raycasting, and kinematic animations)
- **WebXR Device API** (AR surface hit-testing and DOM overlay)
- **HTML5 getUserMedia API** (Universal Web Camera AR passthrough)
- **Three.js USDZExporter** (Apple AR Quick Look integration)
- **TypeScript** & **Vite** (Type-safe compilation and ultra-fast bundling)
- **Web Audio API** (Procedural engine RPM synthesis, gear shift clicks, grinds, and explosions)

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

Run the automated test suite (196 mechanical, kinematic, and UI assertions):

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
Copyright (c) 2025-2026 Naman Sahai.
