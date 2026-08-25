"use client";

import { useEffect, useRef } from "react";
import { ScatterGL, fitView, type View } from "../lib/viewer/ScatterGL";
import { selectInPolygon } from "../lib/viewer/lasso";

interface Props {
  xy: Float32Array;
  rgb: Float32Array;
  /** bump to refit the view (e.g. when the embedding changes) */
  fitKey: string;
  /** when true, dragging draws a lasso instead of panning */
  lasso: boolean;
  onLasso: (indices: Uint32Array) => void;
}

/** WebGL scatter with drag-to-pan and wheel-to-zoom. Double-click resets the view. */
export default function ScatterView({ xy, rgb, fitKey, lasso, onLasso }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const lassoRef = useRef(lasso);
  const onLassoRef = useRef(onLasso);
  useEffect(() => {
    lassoRef.current = lasso;
    onLassoRef.current = onLasso;
  }, [lasso, onLasso]);
  const glRef = useRef<ScatterGL | null>(null);
  const viewRef = useRef<View>({ cx: 0, cy: 0, unitsPerPx: 1 });
  const rafRef = useRef(0);

  const redraw = () => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const gl = glRef.current;
      if (!gl) return;
      gl.resize();
      gl.draw(viewRef.current);
    });
  };

  const fit = () => {
    const c = canvasRef.current;
    if (!c) return;
    viewRef.current = fitView(xy, c.clientWidth, c.clientHeight);
    redraw();
  };

  // init / dispose
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const gl = new ScatterGL(c);
    glRef.current = gl;
    const ro = new ResizeObserver(redraw);
    ro.observe(c);
    return () => {
      ro.disconnect();
      gl.dispose();
      glRef.current = null;
    };
     
  }, []);

  useEffect(() => {
    glRef.current?.setPositions(xy);
    fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [xy, fitKey]);

  useEffect(() => {
    glRef.current?.setColors(rgb);
    redraw();
     
  }, [rgb]);

  // interaction
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let path: number[][] = []; // lasso polygon in CSS px relative to the canvas

    const toData = (px: number, py: number): [number, number] => {
      const v = viewRef.current;
      const r = c.getBoundingClientRect();
      return [v.cx + (px - r.width / 2) * v.unitsPerPx, v.cy - (py - r.height / 2) * v.unitsPerPx];
    };
    const drawPath = () => {
      const o = overlayRef.current;
      if (!o) return;
      const dpr = window.devicePixelRatio || 1;
      const r = c.getBoundingClientRect();
      o.width = r.width * dpr;
      o.height = r.height * dpr;
      const ctx = o.getContext("2d");
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, r.width, r.height);
      if (path.length < 2) return;
      ctx.beginPath();
      ctx.moveTo(path[0][0], path[0][1]);
      for (const [x, y] of path) ctx.lineTo(x, y);
      ctx.closePath();
      ctx.fillStyle = "rgba(52, 211, 153, 0.12)";
      ctx.strokeStyle = "rgb(52, 211, 153)";
      ctx.lineWidth = 1.5;
      ctx.fill();
      ctx.stroke();
    };

    const onDown = (e: PointerEvent) => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      try {
        c.setPointerCapture(e.pointerId);
      } catch {
        /* synthetic or already-released pointer */
      }
      if (lassoRef.current) {
        const r = c.getBoundingClientRect();
        path = [[e.clientX - r.left, e.clientY - r.top]];
      }
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      if (lassoRef.current) {
        const r = c.getBoundingClientRect();
        path.push([e.clientX - r.left, e.clientY - r.top]);
        drawPath();
        return;
      }
      const v = viewRef.current;
      v.cx -= (e.clientX - lastX) * v.unitsPerPx;
      v.cy += (e.clientY - lastY) * v.unitsPerPx; // screen y is down, data y is up
      lastX = e.clientX;
      lastY = e.clientY;
      redraw();
    };
    const onUp = () => {
      if (!dragging) return;
      dragging = false;
      if (lassoRef.current && path.length >= 3) {
        const poly = path.map(([px, py]) => toData(px, py));
        onLassoRef.current(selectInPolygon(xy, poly));
      }
      path = [];
      drawPath();
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const v = viewRef.current;
      const rect = c.getBoundingClientRect();
      const px = e.clientX - rect.left - rect.width / 2;
      const py = e.clientY - rect.top - rect.height / 2;
      const factor = Math.exp(e.deltaY * 0.0015);
      // keep the data point under the cursor fixed
      v.cx += px * v.unitsPerPx * (1 - factor);
      v.cy -= py * v.unitsPerPx * (1 - factor);
      v.unitsPerPx *= factor;
      redraw();
    };
    const onDbl = () => fit();

    c.addEventListener("pointerdown", onDown);
    c.addEventListener("pointermove", onMove);
    c.addEventListener("pointerup", onUp);
    c.addEventListener("pointercancel", onUp);
    c.addEventListener("wheel", onWheel, { passive: false });
    c.addEventListener("dblclick", onDbl);
    return () => {
      c.removeEventListener("pointerdown", onDown);
      c.removeEventListener("pointermove", onMove);
      c.removeEventListener("pointerup", onUp);
      c.removeEventListener("pointercancel", onUp);
      c.removeEventListener("wheel", onWheel);
      c.removeEventListener("dblclick", onDbl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [xy]);

  return (
    <div className="relative h-full w-full">
      <canvas
        ref={canvasRef}
        className={`h-full w-full touch-none ${lasso ? "cursor-crosshair" : "cursor-grab active:cursor-grabbing"}`}
      />
      <canvas ref={overlayRef} className="pointer-events-none absolute inset-0 h-full w-full" />
    </div>
  );
}
