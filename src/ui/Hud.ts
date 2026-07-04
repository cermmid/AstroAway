import type { ObserverLocation } from '../astro/location';

/**
 * Desktop-only DOM overlay: location status, manual location entry, controls
 * hint and the HYG attribution. Hidden inside XR sessions automatically
 * (DOM is not composited into XR).
 */
export class Hud {
  private el: HTMLDivElement;
  private status: HTMLDivElement;

  constructor() {
    this.el = document.createElement('div');
    this.el.id = 'hud';
    this.el.innerHTML = `
      <div class="title">ASTROAWAY</div>
      <div class="status"></div>
      <div style="margin:6px 0">
        szer. <input id="hud-lat" type="number" step="0.01" min="-90" max="90">
        dł. <input id="hud-lon" type="number" step="0.01" min="-180" max="180">
        <button id="hud-apply">ustaw</button>
      </div>
      <div>Przeciągnij myszą, aby się rozejrzeć. Kliknij oznaczoną gwiazdę, aby podróżować. WASD — chodzenie na planecie.</div>
      <div style="opacity:.55;margin-top:6px">Katalog gwiazd: HYG Database (CC BY-SA)</div>
    `;
    this.status = this.el.querySelector('.status') as HTMLDivElement;
    document.body.appendChild(this.el);
    (this.el.querySelector('#hud-apply') as HTMLButtonElement).addEventListener('click', () => {
      const lat = (this.el.querySelector('#hud-lat') as HTMLInputElement).value;
      const lon = (this.el.querySelector('#hud-lon') as HTMLInputElement).value;
      if (lat && lon) {
        const url = new URL(location.href);
        url.searchParams.set('lat', lat);
        url.searchParams.set('lon', lon);
        location.href = url.toString();
      }
    });
  }

  setLocation(loc: ObserverLocation): void {
    const src =
      loc.source === 'geolocation'
        ? 'Twoja lokalizacja'
        : loc.source === 'url'
          ? 'z adresu URL'
          : 'domyślna (Warszawa)';
    this.status.textContent = `Niebo dla: ${loc.latDeg.toFixed(2)}°, ${loc.lonDeg.toFixed(2)}° — ${src}`;
    (this.el.querySelector('#hud-lat') as HTMLInputElement).value = loc.latDeg.toFixed(2);
    (this.el.querySelector('#hud-lon') as HTMLInputElement).value = loc.lonDeg.toFixed(2);
  }

  setMessage(msg: string): void {
    this.status.textContent = msg;
  }
}
