# 3D Educational Manual Gearbox & Drivetrain Simulator

An interactive 3D web-based engineering simulator demonstrating the mechanics of a **3-shaft constant-mesh manual transmission** and automotive drivetrain.

Built with **Three.js**, **WebXR**, **Apple AR Quick Look (USDZ)**, and **TypeScript**.

## Features

- **Interactive 3D Constant-Mesh Model**:
  - Full transmission assembly with 18 inspectable components including flywheel, clutch friction disc, pressure plate, input shaft, countershaft, 1st–5th gear pairs, reverse idler, synchronizer sleeves (1/2, 3/4, 5/R), selector forks, and differential.
  - Animated synchro collar engagement: observe dog teeth and synchronizer sleeves physically sliding into mesh as you shift gears.
  - Real-time kinematic shaft rotation: shafts and free-spinning speed gears rotate at exact mechanical gear ratios.

- **Mobile-First Quick-Shifter**:
  - Persistent on-screen shifter bar (`R`, `1`, `2`, `3`, `4`, `5`, `N`) with auto-clutch assistance for smooth mobile touch interaction.
  - Full synchronization between gear ratio, engine RPM, and road speed.

- **Augmented Reality (AR)**:
  - **iOS / iPadOS**: Native Apple AR Quick Look integration (`.usdz` export) with horizontal plane tracking for tabletop or floor placement.
  - **Android / WebXR**: WebXR `immersive-ar` session with surface detection, hit-testing, tabletop (0.35x), and life-size (1:1) scale presets.
  - **Desktop to Mobile**: High-contrast, camera-detectable QR code for instant mobile access over local HTTPS.

- **Educational Tools**:
  - **Component Inspector**: Detailed breakdown of each component's function, power-flow role, and engineering design notes.
  - **Gear Ratios & Power Flow**: Comprehensive reduction tables from 1st (3.60:1) to 4th (1.00:1 Direct Drive), 5th (0.78:1 Overdrive), and Reverse (3.40:1).
  - **Casing Modes**: Switch between Cutaway, Solid Aluminum, Wireframe, or Hidden casing views.
  - **Exploded View**: Slider to axially separate transmission components for clear internal visibility.

## Tech Stack

- **Three.js** (WebGL 3D Rendering & Kinematics)
- **Three.js USDZExporter** (Apple AR Quick Look generation)
- **WebXR Device API** (AR surface hit-testing)
- **qrcode** (High-contrast QR code rendering)
- **TypeScript** & **Vite**

## Getting Started

### Prerequisites

- Node.js (v18+)
- npm

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

Visit `https://localhost:5173/` or your local network IP over HTTPS to test AR features on mobile devices.

### Testing

Run the automated test suite (163 mechanical and kinematic assertions):

```bash
npm test
```

### Production Build

```bash
npm run build
```
