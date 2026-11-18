/**
 * Camera over the map: position = the world pixel at the centre of the view,
 * zoom = screen pixels per world pixel (1× … 6×; on small screens it may go
 * below 1× so the whole island fits).
 */
export class Camera {
  x = 0;
  y = 0;
  zoom = 1;
  min = 1;
  readonly max = 6;
  /** View size in CSS pixels. */
  vw = 1;
  vh = 1;

  constructor(
    public worldW: number,
    public worldH: number,
  ) {
    this.x = worldW / 2;
    this.y = worldH / 2;
  }

  /** Another world size (phase G: big worlds; old islands keep theirs). */
  setWorld(worldW: number, worldH: number) {
    this.worldW = worldW;
    this.worldH = worldH;
    if (this.vw > 1) this.resize(this.vw, this.vh);
  }

  resize(vw: number, vh: number) {
    this.vw = vw;
    this.vh = vh;
    this.min = Math.min(1, this.fitZoom() * 0.9);
    this.zoom = Math.min(this.max, Math.max(this.min, this.zoom));
    this.clamp();
  }

  /** Zoom at which the whole map fits the view. */
  fitZoom() {
    return Math.min(this.vw / this.worldW, this.vh / this.worldH);
  }

  /**
   * Centre the island and zoom so it fills the view nicely. On a big world
   * the main island in the middle (`focus`, world px) fills it, not the sea.
   */
  frame(focus?: { x: number; y: number; w: number; h: number }) {
    const f = focus ?? { x: this.worldW / 2, y: this.worldH / 2, w: this.worldW, h: this.worldH };
    this.x = f.x;
    this.y = f.y;
    this.zoom = Math.min(this.max, Math.max(this.min, Math.min(this.vw / f.w, this.vh / f.h) * (focus ? 1 : 1.3)));
    this.clamp();
  }

  toWorld(sx: number, sy: number) {
    return { x: this.x + (sx - this.vw / 2) / this.zoom, y: this.y + (sy - this.vh / 2) / this.zoom };
  }

  pan(dx: number, dy: number) {
    this.x -= dx / this.zoom;
    this.y -= dy / this.zoom;
    this.clamp();
  }

  /** Zoom by `factor`, keeping the world point under (sx, sy) where it is. */
  zoomAt(factor: number, sx: number, sy: number) {
    const before = this.toWorld(sx, sy);
    this.zoom = Math.min(this.max, Math.max(this.min, this.zoom * factor));
    const after = this.toWorld(sx, sy);
    this.x += before.x - after.x;
    this.y += before.y - after.y;
    this.clamp();
  }

  /** Keep the centre over the map, so the island never gets lost. */
  clamp() {
    this.x = Math.min(this.worldW, Math.max(0, this.x));
    this.y = Math.min(this.worldH, Math.max(0, this.y));
  }
}
