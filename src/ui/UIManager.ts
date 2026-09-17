import { COMPONENTS, type ComponentInfo } from "../education/ComponentData";
import { SCENARIOS, type ScenarioDefinition } from "../simulation/HypotheticalScenarios";
import {
  TACH_MAX_RPM,
  gearLabel,
  type CasingMode,
  type GearId,
  type SimulationSnapshot,
} from "../simulation/GearboxSimulation";
import { drawQr } from "./qr";
import type { ArScaleMode, ArStatus } from "../gearbox/ArSessionController";

export interface LessonStep {
  title: string;
  body: string;
  hint: (snap: SimulationSnapshot) => boolean;
}

export interface Lesson {
  id: string;
  title: string;
  steps: LessonStep[];
}

export const LESSONS: Lesson[] = [
  {
    id: "launch",
    title: "Lesson 1 — Launching Without Stalling",
    steps: [
      {
        title: "Hold the clutch",
        body: "Press Space / C or the Clutch pedal until it is fully down (P > 0.80).",
        hint: (s) => s.clutchPedal > 0.8,
      },
      {
        title: "Select 1st",
        body: "Tap [1]. The 1/2 synchro sleeve slides over the largest mainshaft gear.",
        hint: (s) => s.gear === 1,
      },
      {
        title: "Build 1,500 RPM",
        body: "Feed a little Gas / W until the tach sits near 1,500 RPM.",
        hint: (s) => s.engineRpm >= 1400,
      },
      {
        title: "Release to the bite",
        body: "Ease the clutch through 0.80 → 0.20. The banner should read Bite Point, then the car rolls.",
        hint: (s) => s.speedKmh > 3 && !s.stalled,
      },
    ],
  },
  {
    id: "upshift",
    title: "Lesson 2 — Upshifting 1st to 2nd",
    steps: [
      {
        title: "Accelerate in 1st",
        body: "Stay in 1st and pull the engine to about 3,000 RPM.",
        hint: (s) => s.gear === 1 && s.engineRpm >= 2800,
      },
      {
        title: "Lift, clutch, 2nd",
        body: "Lift the throttle, press clutch, select [2], then release the clutch and reapply gas.",
        hint: (s) => s.gear === 2 && s.clutchPedal < 0.25 && !s.stalled,
      },
    ],
  },
  {
    id: "cruise",
    title: "Lesson 3 — 4th Direct Drive & 5th Overdrive",
    steps: [
      {
        title: "Reach 4th",
        body: "Work up through the gears into [4]. Watch the countershaft — it stays meshed but carries no torque.",
        hint: (s) => s.gear === 4,
      },
      {
        title: "Select 5th overdrive",
        body: "Clutch and select [5]. Output now spins 28% faster than the engine for low highway RPM.",
        hint: (s) => s.gear === 5,
      },
    ],
  },
  {
    id: "revmatch",
    title: "Lesson 4 — Rev-Matching Downshift",
    steps: [
      {
        title: "Cruise in a higher gear",
        body: "Get into 4th or 5th above 40 km/h so a downshift has a real RPM gap.",
        hint: (s) => (s.gear === 4 || s.gear === 5) && s.speedKmh > 40,
      },
      {
        title: "Clutch, blip, 3rd",
        body: "Press clutch, blip the throttle to raise RPM toward 3rd’s matched speed, select [3], release smoothly.",
        hint: (s) => s.gear === 3 && !s.grindActive,
      },
    ],
  },
  {
    id: "money",
    title: "Lesson 5 — The Money Shift Disaster",
    steps: [
      {
        title: "Build highway speed in 5th",
        body: "Get into 5th and hold about 110 km/h. This is the textbook money-shift setup.",
        hint: (s) => s.gear === 5 && s.speedKmh >= 100,
      },
      {
        title: "Grab 1st",
        body: "Select [1]. Forced RPM ≈ 13,005 — valve float, clutch burst, 1st gear shatters.",
        hint: (s) => s.destroyed,
      },
    ],
  },
];

export interface UICallbacks {
  onShift: (gear: GearId) => void;
  onClutch: (value: number) => void;
  onThrottle: (value: number) => void;
  onBrake: (value: number) => void;
  onRestart: () => void;
  onRepair: () => void;
  onMute: () => boolean;
  onInspect: (id: string) => void;
  onScenario: (id: string) => void;
  onCasing: (mode: CasingMode) => void;
  onExplodeToggle: () => boolean;
  onExplodeAmount: (value: number) => void;
  onUnlockAudio: () => void;
  onAr: () => void;
  onArExit: () => void;
  onArScaleMode: (mode: ArScaleMode) => void;
  onArReposition: () => void;
  onArRotate: (deltaRadians: number) => void;
  onAppleQuickLook?: () => void;
}

export class UIManager {
  private activePanel: string | null = null;
  private lesson: Lesson | null = null;
  private lessonStep = 0;
  private currentComponentIndex = 0;
  private inspectMinimized = false;
  private readonly keys = new Set<string>();

  constructor(private readonly cb: UICallbacks) {}

  setArAvailable(available: boolean): void {
    const header = document.getElementById("btn-ar");
    const sheet = document.getElementById("btn-ar-sheet");
    if (header) header.hidden = !available;
    if (sheet) sheet.hidden = !available;
  }

  bind(): void {
    this.populateComponents();
    this.populateScenarios();
    this.populateLessons();
    this.bindDock();
    this.bindPedals();
    this.bindKeyboard();
    this.bindChrome();
    document.addEventListener("pointerdown", () => this.cb.onUnlockAudio(), { once: true });
  }

  render(snap: SimulationSnapshot): void {
    const gear = document.getElementById("hud-gear");
    const kmh = document.getElementById("hud-kmh");
    const mph = document.getElementById("hud-mph");
    const rpm = document.getElementById("hud-rpm");
    const needle = document.getElementById("tach-needle");
    const feedback = document.getElementById("feedback");
    const fill = document.getElementById("clutch-fill");
    const repair = document.getElementById("btn-repair");
    if (gear) gear.textContent = gearLabel(snap.gear);
    if (kmh) kmh.textContent = Math.round(Math.abs(snap.speedKmh)).toString();
    if (mph) mph.textContent = `${Math.round(Math.abs(snap.speedMph))} mph`;
    if (rpm) rpm.textContent = Math.round(snap.engineRpm).toLocaleString();
    if (needle) needle.style.transform = `translateX(${(snap.engineRpm / TACH_MAX_RPM) * 86}px)`;
    if (fill) fill.style.height = `${snap.clutchPedal * 100}%`;
    if (repair) repair.classList.toggle("hidden", !snap.destroyed);
    if (feedback) {
      feedback.textContent = snap.feedback;
      feedback.classList.toggle("danger", snap.destroyed || snap.stalled || snap.grindActive);
      feedback.classList.toggle("ok", snap.bitePoint || snap.upshiftZone);
    }
    document.querySelectorAll("#shifter button").forEach((btn) => {
      const g = Number((btn as HTMLElement).dataset.gear);
      btn.classList.toggle("on", g === snap.gear);
    });
    document.querySelectorAll("#ar-shifter button").forEach((btn) => {
      const g = Number((btn as HTMLElement).dataset.arGear);
      btn.classList.toggle("on", g === snap.gear);
    });
    this.advanceLesson(snap);
  }

  showComponent(info: ComponentInfo): void {
    const idx = COMPONENTS.findIndex((c) => c.id === info.id);
    if (idx >= 0) this.currentComponentIndex = idx;

    this.setText("card-category", info.category);
    this.setText("card-name", info.name);
    this.setText("card-function", info.primaryFunction);
    this.setText("card-flow", info.powerFlowRole);
    this.setText("card-note", info.engineeringNote);
    this.setText("comp-index-badge", `${this.currentComponentIndex + 1} / ${COMPONENTS.length}`);

    const select = document.getElementById("component-select") as HTMLSelectElement | null;
    if (select) select.value = info.id;

    const heading = document.getElementById("sheet-inspect-heading");
    if (heading) {
      heading.textContent = this.inspectMinimized ? info.name : "Component Inspector";
    }

    this.openPanel("inspect");
    document.querySelectorAll("#component-list button").forEach((btn) => {
      const isTarget = (btn as HTMLElement).dataset.id === info.id;
      btn.classList.toggle("on", isTarget);
    });
  }

  toggleInspectMinimized(): void {
    this.inspectMinimized = !this.inspectMinimized;
    const sheet = document.getElementById("sheet-inspect");
    const label = document.getElementById("inspect-min-label");
    const heading = document.getElementById("sheet-inspect-heading");
    if (sheet) sheet.classList.toggle("minimized", this.inspectMinimized);
    if (label) label.textContent = this.inspectMinimized ? "Expand" : "Minimize";
    if (heading) {
      const current = COMPONENTS[this.currentComponentIndex];
      heading.textContent = this.inspectMinimized ? current?.name ?? "Component" : "Component Inspector";
    }
  }

  selectNextComponent(): void {
    const nextIdx = (this.currentComponentIndex + 1) % COMPONENTS.length;
    this.cb.onInspect(COMPONENTS[nextIdx].id);
  }

  selectPrevComponent(): void {
    const prevIdx = (this.currentComponentIndex - 1 + COMPONENTS.length) % COMPONENTS.length;
    this.cb.onInspect(COMPONENTS[prevIdx].id);
  }

  updateArStatus(status: ArStatus): void {
    const overlay = document.getElementById("ar-overlay");
    const hint = document.getElementById("ar-hint");
    const tabTable = document.getElementById("btn-ar-table");
    const tabFloor = document.getElementById("btn-ar-floor");
    const btnRepo = document.getElementById("btn-ar-reposition");
    const app = document.getElementById("app");

    if (overlay) overlay.classList.toggle("hidden", !status.active);
    if (app) app.classList.toggle("ar-mode-active", status.active);
    if (hint) hint.textContent = status.hint;
    if (tabTable) tabTable.classList.toggle("on", status.scaleMode === "table");
    if (tabFloor) tabFloor.classList.toggle("on", status.scaleMode === "floor");
    if (btnRepo) btnRepo.classList.toggle("active", status.repositioning);
    if (!status.active) this.hideArComponent();
  }

  showArComponent(info: ComponentInfo): void {
    const card = document.getElementById("ar-inspect-card");
    if (!card) return;
    this.setText("ar-card-cat", info.category);
    this.setText("ar-card-title", info.name);
    this.setText("ar-card-desc", info.primaryFunction);
    this.setText("ar-card-flow", info.powerFlowRole);
    card.classList.remove("hidden");
  }

  hideArComponent(): void {
    const card = document.getElementById("ar-inspect-card");
    if (card) card.classList.add("hidden");
  }

  private setText(id: string, value: string): void {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  private populateComponents(): void {
    const select = document.getElementById("component-select") as HTMLSelectElement | null;
    if (select) {
      select.innerHTML = "";
      COMPONENTS.forEach((item, index) => {
        const opt = document.createElement("option");
        opt.value = item.id;
        opt.textContent = `${index + 1}. ${item.name} (${item.category})`;
        select.appendChild(opt);
      });
      select.addEventListener("change", () => {
        this.cb.onInspect(select.value);
      });
    }

    const list = document.getElementById("component-list");
    if (!list) return;
    list.innerHTML = "";
    for (const item of COMPONENTS) {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.dataset.id = item.id;
      btn.textContent = item.name;
      btn.addEventListener("click", () => this.cb.onInspect(item.id));
      li.append(btn);
      list.append(li);
    }
  }

  private populateScenarios(): void {
    const host = document.getElementById("scenario-list");
    if (!host) return;
    host.innerHTML = "";
    for (const scenario of SCENARIOS) {
      host.append(this.scenarioCard(scenario));
    }
  }

  private scenarioCard(scenario: ScenarioDefinition): HTMLElement {
    const article = document.createElement("article");
    article.innerHTML = `
      <p class="eyebrow">${scenario.subtitle}</p>
      <h3>${scenario.title}</h3>
      <p>${scenario.description}</p>
      <p>${scenario.consequence}</p>
      <pre class="formula-block"><code>${scenario.formula}</code></pre>
    `;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = scenario.destructive ? "Run failure" : "Demonstrate";
    btn.addEventListener("click", () => this.cb.onScenario(scenario.id));
    article.append(btn);
    return article;
  }

  private populateLessons(): void {
    const host = document.getElementById("lesson-btns");
    if (!host) return;
    host.innerHTML = "";
    LESSONS.forEach((lesson, index) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = `L${index + 1}`;
      btn.title = lesson.title;
      btn.addEventListener("click", () => this.startLesson(lesson));
      host.append(btn);
    });
  }

  private startLesson(lesson: Lesson): void {
    this.lesson = lesson;
    this.lessonStep = 0;
    this.openPanel(null);
    this.cb.onUnlockAudio();
    this.renderLesson();
  }

  private renderLesson(): void {
    const card = document.getElementById("lesson-card");
    if (!card || !this.lesson) return;
    const step = this.lesson.steps[this.lessonStep];
    card.classList.remove("hidden");
    this.setText("lesson-kicker", `${this.lesson.title} · ${this.lessonStep + 1}/${this.lesson.steps.length}`);
    this.setText("lesson-title", step.title);
    this.setText("lesson-body", step.body);
  }

  private advanceLesson(snap: SimulationSnapshot): void {
    if (!this.lesson) return;
    const step = this.lesson.steps[this.lessonStep];
    if (step.hint(snap) && this.lessonStep < this.lesson.steps.length - 1) {
      this.lessonStep += 1;
      this.renderLesson();
    }
  }

  private bindDock(): void {
    document.querySelectorAll(".dock button").forEach((btn) => {
      btn.addEventListener("click", () => {
        const panel = (btn as HTMLElement).dataset.panel ?? null;
        this.openPanel(this.activePanel === panel ? null : panel);
      });
    });
    document.querySelectorAll("[data-close]").forEach((btn) => {
      btn.addEventListener("click", () => this.openPanel(null));
    });
  }

  private openPanel(id: string | null): void {
    this.activePanel = id;
    for (const name of ["inspect", "ratios", "views", "whatif", "more"]) {
      const sheet = document.getElementById(`sheet-${name}`);
      if (sheet) sheet.hidden = name !== id;
    }
    document.querySelectorAll(".dock button").forEach((btn) => {
      const panel = (btn as HTMLElement).dataset.panel;
      btn.classList.toggle("on", panel === id);
    });
  }

  private bindPedals(): void {
    const clutch = document.getElementById("pedal-clutch");
    const brake = document.getElementById("pedal-brake");
    const gas = document.getElementById("pedal-gas");
    this.bindHold(clutch, (on, ev) => {
      if (!on) {
        this.cb.onClutch(0);
        return;
      }
      const value = this.analogFromEvent(ev, clutch);
      this.cb.onClutch(value);
    });
    this.bindHold(brake, (on) => this.cb.onBrake(on ? 1 : 0));
    this.bindHold(gas, (on) => this.cb.onThrottle(on ? 1 : 0));

    document.querySelectorAll("#shifter button").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.cb.onShift(Number((btn as HTMLElement).dataset.gear) as GearId);
      });
    });
  }

  private analogFromEvent(ev: PointerEvent | undefined, el: HTMLElement | null): number {
    if (!ev || !el) return 1;
    const rect = el.getBoundingClientRect();
    const y = (rect.bottom - ev.clientY) / rect.height;
    return Math.min(1, Math.max(0.2, y));
  }

  private bindHold(el: HTMLElement | null, fn: (on: boolean, ev?: PointerEvent) => void): void {
    if (!el) return;
    const start = (ev: PointerEvent) => {
      el.classList.add("active");
      el.setPointerCapture(ev.pointerId);
      fn(true, ev);
    };
    const move = (ev: PointerEvent) => {
      if (!el.classList.contains("active")) return;
      fn(true, ev);
    };
    const end = () => {
      el.classList.remove("active");
      fn(false);
    };
    el.addEventListener("pointerdown", start);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
  }

  private bindKeyboard(): void {
    window.addEventListener("keydown", (ev) => {
      if (ev.repeat) return;
      const key = ev.key.toLowerCase();
      this.keys.add(key);
      if (key === " " || key === "c") {
        ev.preventDefault();
        this.cb.onClutch(1);
      }
      if (key === "w" || key === "arrowup") this.cb.onThrottle(1);
      if (key === "s" || key === "arrowdown") this.cb.onBrake(1);
      if (key === "n") this.cb.onShift(0);
      if (key === "r") this.cb.onShift(-1);
      if (["1", "2", "3", "4", "5"].includes(key)) this.cb.onShift(Number(key) as GearId);
    });
    window.addEventListener("keyup", (ev) => {
      const key = ev.key.toLowerCase();
      this.keys.delete(key);
      if (key === " " || key === "c") this.cb.onClutch(0);
      if (key === "w" || key === "arrowup") this.cb.onThrottle(0);
      if (key === "s" || key === "arrowdown") this.cb.onBrake(0);
    });
  }

  private bindChrome(): void {
    document.getElementById("btn-restart")?.addEventListener("click", () => this.cb.onRestart());
    document.getElementById("btn-repair")?.addEventListener("click", () => this.cb.onRepair());
    document.getElementById("btn-mute")?.addEventListener("click", (ev) => {
      const muted = this.cb.onMute();
      const btn = ev.currentTarget as HTMLButtonElement;
      btn.setAttribute("aria-pressed", String(muted));
      btn.textContent = muted ? "Muted" : "Sound";
    });
    document.getElementById("btn-modal-usdz")?.addEventListener("click", () => this.cb.onAppleQuickLook?.());
    document.getElementById("btn-ar")?.addEventListener("click", () => this.cb.onAr());
    document.getElementById("btn-ar-sheet")?.addEventListener("click", () => {
      this.openPanel(null);
      this.cb.onAr();
    });

    // Inspector minimize and arrow navigation
    document.getElementById("btn-minimize-inspect")?.addEventListener("click", () => this.toggleInspectMinimized());
    document.getElementById("btn-prev-comp")?.addEventListener("click", () => this.selectPrevComponent());
    document.getElementById("btn-next-comp")?.addEventListener("click", () => this.selectNextComponent());

    // AR Overlay controls
    document.getElementById("btn-ar-exit")?.addEventListener("click", () => this.cb.onArExit());
    document.getElementById("btn-ar-table")?.addEventListener("click", () => this.cb.onArScaleMode("table"));
    document.getElementById("btn-ar-floor")?.addEventListener("click", () => this.cb.onArScaleMode("floor"));
    document.getElementById("btn-ar-reposition")?.addEventListener("click", () => this.cb.onArReposition());
    document.getElementById("btn-ar-rot-left")?.addEventListener("click", () => this.cb.onArRotate(-Math.PI / 12));
    document.getElementById("btn-ar-rot-right")?.addEventListener("click", () => this.cb.onArRotate(Math.PI / 12));
    document.getElementById("btn-ar-card-close")?.addEventListener("click", () => this.hideArComponent());

    document.querySelectorAll("#ar-shifter button").forEach((btn) => {
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        this.cb.onShift(Number((btn as HTMLElement).dataset.arGear) as GearId);
      });
    });

    document.getElementById("btn-explode")?.addEventListener("click", (ev) => {
      const exploded = this.cb.onExplodeToggle();
      (ev.currentTarget as HTMLButtonElement).textContent = exploded ? "Collapse" : "Explode";
      const slider = document.getElementById("explode-slider") as HTMLInputElement | null;
      if (slider) slider.value = exploded ? "100" : "0";
    });
    document.getElementById("explode-slider")?.addEventListener("input", (ev) => {
      this.cb.onExplodeAmount(Number((ev.target as HTMLInputElement).value) / 100);
    });
    document.getElementById("casing-modes")?.addEventListener("click", (ev) => {
      const btn = (ev.target as HTMLElement).closest("button");
      const mode = btn?.dataset.mode as CasingMode | undefined;
      if (!mode) return;
      this.cb.onCasing(mode);
      document.querySelectorAll("#casing-modes button").forEach((b) => b.classList.toggle("on", b === btn));
    });
    document.getElementById("lesson-exit")?.addEventListener("click", () => {
      this.lesson = null;
      document.getElementById("lesson-card")?.classList.add("hidden");
    });
    document.getElementById("lesson-next")?.addEventListener("click", () => {
      if (!this.lesson) return;
      this.lessonStep = Math.min(this.lesson.steps.length - 1, this.lessonStep + 1);
      this.renderLesson();
    });
    document.getElementById("btn-qr")?.addEventListener("click", () => this.openQr());
    document.getElementById("btn-close-qr")?.addEventListener("click", () => {
      document.getElementById("qr-modal")?.classList.add("hidden");
    });
    document.getElementById("btn-copy-url")?.addEventListener("click", async () => {
      const urlEl = document.getElementById("qr-url");
      const textToCopy = urlEl?.textContent || window.location.href;
      try {
        await navigator.clipboard.writeText(textToCopy);
      } catch {
        /* clipboard can be blocked on insecure origins */
      }
    });
  }

  openQr(): void {
    const modal = document.getElementById("qr-modal");
    const canvas = document.getElementById("qr-canvas") as HTMLCanvasElement | null;
    const urlEl = document.getElementById("qr-url");

    // Construct mobile-accessible network HTTPS URL:
    const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    const port = window.location.port ? `:${window.location.port}` : ":5173";
    let targetUrl: string;
    if (isLocalhost) {
      targetUrl = `https://10.21.0.127${port}/`;
    } else if (window.location.protocol === "http:") {
      targetUrl = window.location.href.replace(/^http:/, "https:");
    } else {
      targetUrl = window.location.href;
    }

    if (urlEl) urlEl.textContent = targetUrl;
    if (canvas) drawQr(canvas, targetUrl);
    modal?.classList.remove("hidden");
  }
}
