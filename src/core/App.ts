import { Group, PerspectiveCamera, Vector3, WebGLRenderer } from 'three';
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js';
import { altAzToVector3, raDecToAltAz } from '../astro/coords';
import {
  DEFAULT_LOCATION,
  locationFromUrl,
  requestGeolocation,
  type ObserverLocation,
} from '../astro/location';
import { localSiderealTime } from '../astro/time';
import { Ambience } from '../audio/Ambience';
import { KnowledgeBase } from '../data/KnowledgeBase';
import { DesktopControls } from '../input/DesktopControls';
import { InputSystem } from '../input/InputSystem';
import { XRControls } from '../input/XRControls';
import { BeachScene } from '../scenes/BeachScene';
import { TravelScene } from '../scenes/TravelScene';
import { WorldScene } from '../scenes/WorldScene';
import { StarCatalog } from '../sky/StarCatalog';
import { STAR_SPHERE_RADIUS } from '../sky/StarField';
import { Hud } from '../ui/Hud';
import { markAppReady, registerDebug } from './debug';
import { SceneManager } from './SceneManager';

const DEG = Math.PI / 180;

export interface AppContext {
  renderer: WebGLRenderer;
  camera: PerspectiveCamera;
  cameraRig: Group;
  input: InputSystem;
  desktop: DesktopControls;
  sceneManager: SceneManager;
  kb: KnowledgeBase;
  catalog: StarCatalog;
  ambience: Ambience;
  hud: Hud | null;
  params: URLSearchParams;
  getLocation(): ObserverLocation;
  getNow(): Date;
}

export class App {
  static async start(): Promise<void> {
    const params = new URLSearchParams(location.search);

    const renderer = new WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;
    document.body.appendChild(renderer.domElement);

    const camera = new PerspectiveCamera(
      70,
      window.innerWidth / window.innerHeight,
      0.05,
      2400,
    );
    camera.rotation.order = 'YXZ';
    camera.position.y = 1.6;
    const cameraRig = new Group();
    cameraRig.add(camera);

    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // ?yaw= (compass azimuth) and ?pitch= aim the initial view — handy for
    // deep links and deterministic screenshots.
    const yaw = parseFloat(params.get('yaw') ?? '');
    if (Number.isFinite(yaw)) cameraRig.rotation.y = -yaw * DEG;
    const pitch = parseFloat(params.get('pitch') ?? '');
    if (Number.isFinite(pitch)) camera.rotation.x = pitch * DEG;

    // Fixed ?time= freezes the clock for deterministic screenshots.
    const timeParam = params.get('time');
    const fixedEpoch = timeParam ? new Date(timeParam) : null;
    const getNow = () => (fixedEpoch ? new Date(fixedEpoch.getTime()) : new Date());

    let observer = locationFromUrl(params) ?? DEFAULT_LOCATION;

    const [kb, catalog] = await Promise.all([KnowledgeBase.load(), StarCatalog.load()]);

    const input = new InputSystem();
    const desktop = new DesktopControls(renderer, camera, cameraRig, input);
    const xr = new XRControls(renderer, cameraRig, input);
    const ambience = new Ambience();
    const hud = new Hud();

    const ctx = {
      renderer,
      camera,
      cameraRig,
      input,
      desktop,
      kb,
      catalog,
      ambience,
      hud,
      params,
      getLocation: () => observer,
      getNow,
    } as AppContext;
    const sceneManager = new SceneManager(ctx);
    ctx.sceneManager = sceneManager;

    sceneManager.register(new BeachScene());
    sceneManager.register(new TravelScene());
    for (const world of kb.getDestinations()) {
      sceneManager.register(new WorldScene(world));
    }

    hud.setLocation(observer);
    if (observer.source !== 'url') {
      void requestGeolocation().then((loc) => {
        if (loc) {
          observer = loc;
          hud.setLocation(loc);
        }
      });
    }

    if (navigator.xr) {
      try {
        if (await navigator.xr.isSessionSupported('immersive-vr')) {
          document.body.appendChild(VRButton.createButton(renderer));
          renderer.xr.setFoveation(1);
        }
      } catch {
        // No XR — desktop mode only.
      }
    }

    // Introspection hooks for automated verification (scripts/verify/*).
    registerDebug('getStarAltAz', (name: string) => {
      const star = catalog.findNamed(name);
      if (!star) return null;
      const loc = ctx.getLocation();
      const { alt, az } = raDecToAltAz(
        star.raRad,
        star.decRad,
        loc.latDeg * DEG,
        localSiderealTime(getNow(), loc.lonDeg),
      );
      return { altDeg: alt / DEG, azDeg: az / DEG };
    });
    registerDebug('getStarScreenPos', (name: string) => {
      const star = catalog.findNamed(name);
      if (!star) return null;
      const loc = ctx.getLocation();
      const { alt, az } = raDecToAltAz(
        star.raRad,
        star.decRad,
        loc.latDeg * DEG,
        localSiderealTime(getNow(), loc.lonDeg),
      );
      const v = altAzToVector3(alt, az, new Vector3()).multiplyScalar(STAR_SPHERE_RADIUS);
      v.project(camera);
      return {
        x: ((v.x + 1) / 2) * window.innerWidth,
        y: ((1 - v.y) / 2) * window.innerHeight,
        inFront: v.z < 1,
      };
    });
    registerDebug('getLocation', () => ctx.getLocation());
    registerDebug('renderInfo', () => ({
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
    }));

    let last = performance.now();
    renderer.setAnimationLoop((t) => {
      const dt = Math.min(0.1, (t - last) / 1000);
      last = t;
      desktop.update(dt);
      xr.update();
      sceneManager.update(dt, t / 1000);
      const active = sceneManager.activeScene;
      if (active) renderer.render(active.scene, camera);
    });

    const requested = params.get('scene') ?? 'beach';
    const sceneId =
      requested === 'beach' || requested === 'travel' ? requested : `world:${requested}`;
    await sceneManager.goTo(sceneId);
    markAppReady();
  }
}
