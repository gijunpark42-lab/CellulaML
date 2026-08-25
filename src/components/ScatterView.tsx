"use client";

import { useEffect, useRef } from "react";
import { ScatterGL, fitView, type View } from "../lib/viewer/ScatterGL";

interface Props {
  xy: Float32Array;
  rgb: Float32Array;
  /** bump to refit the view (e.g. when the embedding changes) */
  fitKey: string;
}

/** WebGL scatter with drag-to-pan and wheel-to-zoom. Double-click resets the view. */
export default function ScatterView({ xy, rgb, fitKey }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
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

    const onDown = (e: PointerEvent) => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      c.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const v = viewRef.current;
      v.cx -= (e.clientX - lastX) * v.unitsPerPx;
      v.cy += (e.clientY - lastY) * v.unitsPerPx; // screen y is down, data y is up
      lastX = e.clientX;
      lastY = e.clientY;
      redraw();
    };
    const onUp = () => {
      dragging = false;
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
    <canvas ref={canvasRef} className="h-full w-full cursor-grab touch-none active:cursor-grabbing" />
  );
}
