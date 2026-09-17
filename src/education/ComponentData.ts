export interface ComponentInfo {
  id: string;
  name: string;
  category: string;
  primaryFunction: string;
  powerFlowRole: string;
  engineeringNote: string;
}

export const COMPONENTS: ComponentInfo[] = [
  {
    id: "flywheel",
    name: "Engine Flywheel",
    category: "Clutch / Engine Interface",
    primaryFunction:
      "Stores rotational inertia from the crankshaft and provides a machined friction face for the clutch disc.",
    powerFlowRole:
      "Receives all engine torque at the starter ring gear and friction face, then offers that torque to the clutch disc when the pressure plate clamps.",
    engineeringNote:
      "A cast-steel flywheel is sized so idle is stable (~800 RPM) without lugging, yet the engine can still rev. Outer ring-gear teeth let the starter motor crank the engine. Excess inertia makes shifts feel lazy; too little inertia makes idle fragile and stall-prone.",
  },
  {
    id: "clutch-disc",
    name: "Clutch Friction Disc",
    category: "Clutch Sub-Assembly",
    primaryFunction:
      "Transmits engine torque through dual organic friction facings while the hub slides on the input-shaft splines.",
    powerFlowRole:
      "The only friction path between the flywheel/pressure-plate sandwich and the transmission input shaft. Six torsional damper springs isolate driveline shock.",
    engineeringNote:
      "Woven organic facings give a progressive bite point. Holding 50% slip at high throttle cooks the facings, glazing the surface and collapsing the friction coefficient μ. Centrifugal burst becomes a real risk above ~10,000 RPM — the money-shift failure mode.",
  },
  {
    id: "pressure-plate",
    name: "Pressure Plate & Diaphragm Spring",
    category: "Clutch Sub-Assembly",
    primaryFunction:
      "A Belleville diaphragm spring clamps the friction disc and, when the fingers are pressed, pivots about fulcrum rings to retract the plate.",
    powerFlowRole:
      "Sets the normal force F_N that creates clutch torque τ = k_engage · μ · F_spring · r_eff. No clamp means zero torque path.",
    engineeringNote:
      "Radially slotted diaphragm fingers act as both spring and release levers. Pedal position P > 0.80 unloads F_N entirely; P < 0.20 is mechanical lockup. The 0.20–0.80 band is the bite-point / slip region used to launch without stalling.",
  },
  {
    id: "release-bearing",
    name: "Clutch Release Bearing",
    category: "Clutch Sub-Assembly",
    primaryFunction:
      "Throw-out bearing that presses the diaphragm fingers when the clutch fork is actuated.",
    powerFlowRole:
      "Does not carry drive torque. It only converts fork motion into axial load on the diaphragm so the friction disc can freewheel.",
    engineeringNote:
      "A sealed thrust bearing rides on the front bearing retainer. Riding the clutch (partial pedal at cruise) keeps the bearing spinning under load and overheats both the bearing and the facings.",
  },
  {
    id: "input-shaft",
    name: "Transmission Input Shaft",
    category: "Shafts",
    primaryFunction:
      "Clutch shaft that carries the main drive pinion and is splined to the friction-disc hub.",
    powerFlowRole:
      "First rotating member inside the gearbox. In gears 1–3, 5, and R it drives the countershaft cluster; in 4th it locks directly to the output shaft (1:1).",
    engineeringNote:
      "A pilot bearing in the flywheel supports the nose of the input shaft. The input and output shafts are coaxial — 4th gear is simply a dog-clutch lock between them, which is why 4th bypasses the countershaft and is the most efficient ratio.",
  },
  {
    id: "countershaft",
    name: "Countershaft (Layshaft) Cluster",
    category: "Shafts",
    primaryFunction:
      "Solid cluster shaft with gears fixed rigidly to it: drive, 1st, 2nd, 3rd, 5th, and reverse drive.",
    powerFlowRole:
      "Always meshed with the input pinion. It multiplies (or overdrives) torque into the free-spinning mainshaft speed gears. Unloaded in 4th gear.",
    engineeringNote:
      "ω_counter = ω_input × (N_drive_pinion / N_counter_drive). Because the cluster is one forging (or gears splined and jammed), every counter gear shares the same angular velocity. Needle-bearing mainshaft gears still spin around the output shaft even in neutral — that is constant mesh.",
  },
  {
    id: "gear-1",
    name: "1st Gear Pair (3.60:1)",
    category: "Speed Gears",
    primaryFunction:
      "Highest reduction pair for launch and steep-grade climbing.",
    powerFlowRole:
      "Input → countershaft → 1st counter gear → 1st main gear → 1/2 synchro sleeve → output shaft.",
    engineeringNote:
      "Largest mainshaft gear, smallest matching counter gear. Ratio 3.60:1 means the output shaft turns once for every 3.6 engine revolutions (clutch locked). Forced engagement at highway speed over-revs the engine past valve-float (~13,000 RPM at 110 km/h).",
  },
  {
    id: "gear-2",
    name: "2nd Gear Pair (2.10:1)",
    category: "Speed Gears",
    primaryFunction:
      "Intermediate reduction used for acceleration after launch.",
    powerFlowRole:
      "Same two-step path as 1st, but through the 2nd counter/main pair and the opposite face of the 1/2 synchro.",
    engineeringNote:
      "A 2.10:1 step keeps the engine in its torque band after leaving 1st. Upshifting 1→2 is the classic student exercise: lift, clutch, select 2, feed the bite point, then throttle.",
  },
  {
    id: "gear-3",
    name: "3rd Gear Pair (1.40:1)",
    category: "Speed Gears",
    primaryFunction:
      "Mid-range urban ratio between acceleration and direct drive.",
    powerFlowRole:
      "Countershaft 3rd gear drives the free-spinning 3rd main gear; the 3/4 synchro locks that gear to the output shaft.",
    engineeringNote:
      "1.40:1 is the typical city-cruise / rev-match downshift target. Heel-and-toe downshifts into 3rd require a throttle blip so engine RPM equals ω_out × 1.40 before the sleeve engages.",
  },
  {
    id: "gear-4",
    name: "4th Gear Direct Drive Dog Clutch (1.00:1)",
    category: "Speed Gears",
    primaryFunction:
      "Locks the input shaft directly to the output shaft for 1:1 drive.",
    powerFlowRole:
      "Power never goes through the countershaft. Input dog teeth → 3/4 synchro sleeve → output shaft. Countershaft still spins (constant mesh) but carries no torque.",
    engineeringNote:
      "Direct drive is ~100% mechanically efficient aside from bearing and windage losses. That is why 4th is the textbook 'cruise' gear on a 5-speed before overdrive was common.",
  },
  {
    id: "gear-5",
    name: "5th Gear Overdrive Pair (0.78:1)",
    category: "Speed Gears",
    primaryFunction:
      "Overdrive pair that spins the output 28% faster than the engine for low highway RPM.",
    powerFlowRole:
      "Input → countershaft → 5th counter (large) → 5th main (small) → 5/R synchro → output.",
    engineeringNote:
      "i = 0.78 means ω_out = ω_engine / 0.78. Fuel is saved because engine friction and pumping losses drop with RPM. The money shift is 5th → 1st at speed: the 3.60/0.78 = 4.6× RPM jump exceeds valve-spring return speed.",
  },
  {
    id: "reverse-idler",
    name: "Reverse Idler Gear Assembly",
    category: "Reverse Train",
    primaryFunction:
      "An intermediate idler on its own stub shaft that inverts output rotation.",
    powerFlowRole:
      "Countershaft reverse drive → reverse idler → reverse main gear → 5/R synchro → output. Three meshes yield ω_out < 0.",
    engineeringNote:
      "An extra gear does not change the magnitude of the 3.40:1 ratio; it only flips sign. Dropping the idler into mesh at highway speed clashes two counter-rotating tooth sets and shears dog teeth instantly.",
  },
  {
    id: "synchro-12",
    name: "1st/2nd Synchronizer Ring & Sleeve",
    category: "Synchronizer Assemblies",
    primaryFunction:
      "Brass baulk rings equalize speed, then the sliding sleeve locks 1st or 2nd to the output shaft.",
    powerFlowRole:
      "The hub is splined to the output shaft. The sleeve is the only torque path from a free-spinning speed gear into the shaft.",
    engineeringNote:
      "Cone friction on the baulk ring must bring the gear to shaft speed before the dog teeth can pass. Shifting with P_clutch < 0.50 skips that friction phase — the dogs grind, and repeated abuse destroys the ring.",
  },
  {
    id: "synchro-34",
    name: "3rd/4th Synchronizer Ring & Sleeve",
    category: "Synchronizer Assemblies",
    primaryFunction:
      "Selects 3rd speed gear or locks the input shaft for direct 4th.",
    powerFlowRole:
      "Toward the rear: 3rd main gear. Toward the front: input-shaft dog clutch (4th). Hub remains splined to the output shaft.",
    engineeringNote:
      "This is the only synchro that can couple two coaxial shafts. When 4th is selected the countershaft cluster is unloaded — you can hear the gearbox quiet slightly at the same road speed.",
  },
  {
    id: "synchro-5r",
    name: "5th/Reverse Synchronizer Ring & Sleeve",
    category: "Synchronizer Assemblies",
    primaryFunction:
      "Locks either 5th (overdrive) or reverse to the output shaft.",
    powerFlowRole:
      "Same hub-and-sleeve architecture as 1/2, but reverse often uses a simpler dog or blocker because engagement is intended only at rest.",
    engineeringNote:
      "Many gearboxes leave reverse unsynchronized or lightly synchronized. That is why selecting R while rolling forward is a classic clash failure — there is no cone friction large enough to reverse a spinning main gear.",
  },
  {
    id: "selector",
    name: "Gear Selector Mechanism & Shift Forks",
    category: "Shift Actuation",
    primaryFunction:
      "Converts H-pattern (or keypad) motion into axial travel of three selector forks on the synchro sleeves.",
    powerFlowRole:
      "Carries no drive torque. Interlock plungers ensure only one fork is off-neutral so two gears cannot lock the cluster against itself.",
    engineeringNote:
      "A double-engagement interlock is mandatory: if 1st and 2nd locked at once the output shaft would have two different demanded speeds and the case would explode. Detent notches give the driver the familiar gate feel.",
  },
  {
    id: "differential",
    name: "Differential Pinion & Crown Ring Gear",
    category: "Final Drive",
    primaryFunction:
      "The output pinion drives a 3.90:1 ring gear; spider gears split torque to the two half-shafts.",
    powerFlowRole:
      "Last reduction before the tires. v_km/h = (ω_out_RPM × 2π × r_tire × 60) / (1000 × i_final) with r_tire = 0.31 m.",
    engineeringNote:
      "Open spider gears let the inside wheel slow and the outside wheel speed up in a turn while still splitting torque. The 3.90 crown-and-pinion multiplies every gearbox ratio — 1st becomes 3.60 × 3.90 = 14.04:1 overall.",
  },
  {
    id: "casing",
    name: "Transmission Casing & Lubrication Sump",
    category: "Housing & Lubrication",
    primaryFunction:
      "Die-cast aluminum case with bell housing, ribs, drain plug, and oil-level sight glass that locates every shaft and splash-feeds the mesh.",
    powerFlowRole:
      "Structural ground path for bearing reactions. Does not rotate, but every mesh force closes through the case webs.",
    engineeringNote:
      "Gear oil both lubricates and carries heat out of the synchro cones. A sight glass lets a technician confirm level without dropping the sump. Cutaway mode keeps this silhouette so students still see how the industrial casting packages the three shafts.",
  },
];

export function getComponent(id: string): ComponentInfo | undefined {
  return COMPONENTS.find((c) => c.id === id);
}

export function requireAllComponents(): ComponentInfo[] {
  if (COMPONENTS.length !== 18) {
    throw new Error(`Expected 18 components, found ${COMPONENTS.length}`);
  }
  return COMPONENTS;
}
