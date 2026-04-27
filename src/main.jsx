import React, { StrictMode, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Alignment, Fit, Layout, Rive } from "@rive-app/canvas";
import "./styles.css";

const carouselRows = Array.from({ length: 7 }, (_, index) => index);
const eyeCount = 15;
const eyeSize = 72;
const eyeRadius = 34;
const basePanelWidth = 740;
const basePanelHeight = 370;
const eyeInstances = Array.from({ length: eyeCount }, (_, index) => ({
  id: index,
  instanceName: `Instance ${index + 1}`,
  artboardName: `${index + 1}`,
}));
const spawnEyeLayout = Array.from({ length: eyeCount }, (_, index) => {
  const columns = 5;
  const row = Math.floor(index / columns);
  const column = index % columns;
  return {
    x: 318 + (column - 2) * 18 + (row % 2) * 10,
    y: -230 - row * 96 - column * 18,
    vx: (column - 2) * 4,
  };
});

function MetaRow({ lead, value, align = "between" }) {
  return (
    <div className={`meta-row meta-row--${align}`}>
      {lead ? <span className="meta-label">{lead}</span> : null}
      <span className="leader" aria-hidden="true" />
      <span className="meta-value">{value}</span>
    </div>
  );
}

function IllustrationCarousel() {
  const playgroundRef = useRef(null);
  const eyesRef = useRef([]);
  const dragRef = useRef(null);
  const frameRef = useRef(0);
  const [detectedInstances, setDetectedInstances] = useState([]);

  const eyes = useMemo(
    () =>
      eyeInstances.map((eye, index) => ({
        ...eye,
        x: spawnEyeLayout[index].x,
        y: spawnEyeLayout[index].y,
        vx: spawnEyeLayout[index].vx,
        vy: 0,
        isActive: true,
        isDragging: false,
      })),
    []
  );

  useEffect(() => {
    eyesRef.current = eyes.map((eye) => ({ ...eye }));
  }, [eyes]);

  useEffect(() => {
    const resizeEyes = () => {
      const playground = playgroundRef.current;
      if (!playground) {
        return;
      }

      const scaleX = playground.clientWidth / basePanelWidth;
      const scaleY = playground.clientHeight / basePanelHeight;
      eyesRef.current.forEach((eye, index) => {
        const spawn = spawnEyeLayout[index];
        eye.x = Math.min(
          playground.clientWidth - eyeSize,
          Math.max(0, spawn.x * scaleX)
        );
        eye.y = spawn.y * scaleY;
        eye.vx = spawn.vx * scaleX;
        eye.vy = 0;
        eye.isActive = true;
      });
    };

    resizeEyes();
    window.addEventListener("resize", resizeEyes);
    return () => window.removeEventListener("resize", resizeEyes);
  }, []);

  useEffect(() => {
    let lastTime = performance.now();

    const tick = (time) => {
      const playground = playgroundRef.current;
      if (!playground) {
        frameRef.current = requestAnimationFrame(tick);
        return;
      }

      const dt = Math.min((time - lastTime) / 1000, 0.032);
      lastTime = time;
      const maxX = playground.clientWidth - eyeSize;
      const maxY = playground.clientHeight - eyeSize;
      const centerX = playground.clientWidth / 2;

      eyesRef.current.forEach((eye) => {
        if (eye.isActive && !eye.isDragging) {
          const eyeCenterX = eye.x + eyeSize / 2;
          eye.vx += (centerX - eyeCenterX) * 0.9 * dt;
          eye.vy += 980 * dt;
          eye.x += eye.vx * dt;
          eye.y += eye.vy * dt;
          eye.vx *= 0.998;
          eye.vy *= 0.998;
        }

        constrainToPanel(eye, maxX, maxY);
      });

      for (let iteration = 0; iteration < 5; iteration += 1) {
        resolveEyeCollisions(eyesRef.current);
        eyesRef.current.forEach((eye) => constrainToPanel(eye, maxX, maxY));
      }

      eyesRef.current.forEach((eye) => {
        const node = document.querySelector(`[data-eye-id="${eye.id}"]`);
        if (node) {
          node.style.transform = `translate3d(${eye.x}px, ${eye.y}px, 0)`;
        }
      });

      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, []);

  const handlePointerDown = (event, id) => {
    const playground = playgroundRef.current;
    const eye = eyesRef.current[id];
    if (!playground || !eye) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    const bounds = playground.getBoundingClientRect();
    eye.isDragging = true;
    eye.isActive = true;
    eye.vx = 0;
    eye.vy = 0;

    dragRef.current = {
      id,
      pointerId: event.pointerId,
      offsetX: event.clientX - bounds.left - eye.x,
      offsetY: event.clientY - bounds.top - eye.y,
      lastX: event.clientX,
      lastY: event.clientY,
      lastTime: performance.now(),
    };
  };

  const handlePointerMove = (event) => {
    const playground = playgroundRef.current;
    const drag = dragRef.current;
    if (!playground || !drag || drag.pointerId !== event.pointerId) {
      return;
    }

    const eye = eyesRef.current[drag.id];
    const bounds = playground.getBoundingClientRect();
    const now = performance.now();
    const dt = Math.max((now - drag.lastTime) / 1000, 0.001);

    eye.x = Math.min(
      playground.clientWidth - eyeSize,
      Math.max(0, event.clientX - bounds.left - drag.offsetX)
    );
    eye.y = Math.min(
      playground.clientHeight - eyeSize,
      Math.max(0, event.clientY - bounds.top - drag.offsetY)
    );
    eye.vx = (event.clientX - drag.lastX) / dt;
    eye.vy = (event.clientY - drag.lastY) / dt;

    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    drag.lastTime = now;
  };

  const handlePointerUp = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    const eye = eyesRef.current[drag.id];
    if (eye) {
      eye.isDragging = false;
      eye.isActive = true;
      eye.vx = Math.max(-1200, Math.min(1200, eye.vx));
      eye.vy = Math.max(-1200, Math.min(1200, eye.vy));
    }
    dragRef.current = null;
  };

  return (
    <section className="illustration-panel" aria-label="Illustrations carousel">
      <div className="carousel-track">
        {carouselRows.map((row) => (
          <p key={row} style={{ "--row-index": row }}>
            ILLUSTRATIONS
          </p>
        ))}
      </div>
      <div
        className="eye-playground"
        ref={playgroundRef}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {eyeInstances.map((eye) => (
          <RiveEye
            key={eye.id}
            {...eye}
            onDetectedInstances={setDetectedInstances}
            onPointerDown={handlePointerDown}
          />
        ))}
      </div>
      <span className="sr-only">
        Loaded {detectedInstances.length || eyeCount} ViewModel1 instances from
        eyes.riv for draggable eye physics.
      </span>
    </section>
  );
}

function constrainToPanel(eye, maxX, maxY) {
  if (eye.x < 0) {
    eye.x = 0;
    eye.vx = Math.abs(eye.vx) * 0.55;
  } else if (eye.x > maxX) {
    eye.x = maxX;
    eye.vx = -Math.abs(eye.vx) * 0.55;
  }

  if (eye.y < -eyeSize && eye.vy < 0) {
    eye.y = -eyeSize;
    eye.vy = Math.abs(eye.vy) * 0.4;
  } else if (eye.y > maxY) {
    eye.y = maxY;
    eye.vy = -Math.abs(eye.vy) * 0.28;
    eye.vx *= 0.62;

    if (Math.abs(eye.vy) < 18) {
      eye.vy = 0;
    }

    if (Math.abs(eye.vx) < 4) {
      eye.vx = 0;
    }
  }
}

function resolveEyeCollisions(eyes) {
  const minDistance = eyeRadius * 2;

  for (let firstIndex = 0; firstIndex < eyes.length; firstIndex += 1) {
    for (
      let secondIndex = firstIndex + 1;
      secondIndex < eyes.length;
      secondIndex += 1
    ) {
      const first = eyes[firstIndex];
      const second = eyes[secondIndex];
      const firstMass = first.isDragging ? 0 : 1;
      const secondMass = second.isDragging ? 0 : 1;

      if (firstMass + secondMass === 0) {
        continue;
      }

      const dx = second.x - first.x;
      const dy = second.y - first.y;
      const distance = Math.hypot(dx, dy) || 0.001;

      if (distance >= minDistance) {
        continue;
      }

      const normalX = dx / distance;
      const normalY = dy / distance;
      const overlap = minDistance - distance;
      const correction = overlap / (firstMass + secondMass);

      first.x -= normalX * correction * firstMass;
      first.y -= normalY * correction * firstMass;
      second.x += normalX * correction * secondMass;
      second.y += normalY * correction * secondMass;

      const relativeVelocityX = second.vx - first.vx;
      const relativeVelocityY = second.vy - first.vy;
      const normalVelocity =
        relativeVelocityX * normalX + relativeVelocityY * normalY;

      if (normalVelocity < 0) {
        const restitution = 0.34;
        const impulse =
          (-(1 + restitution) * normalVelocity) / (firstMass + secondMass);
        const impulseX = impulse * normalX;
        const impulseY = impulse * normalY;

        if (firstMass) {
          first.vx -= impulseX * firstMass;
          first.vy -= impulseY * firstMass;
        }

        if (secondMass) {
          second.vx += impulseX * secondMass;
          second.vy += impulseY * secondMass;
        }
      }

      first.vx *= 0.992;
      first.vy *= 0.992;
      second.vx *= 0.992;
      second.vy *= 0.992;
    }
  }
}

function RiveEye({
  id,
  instanceName,
  artboardName,
  onDetectedInstances,
  onPointerDown,
}) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return undefined;
    }

    let riveInstance;
    let isCancelled = false;

    riveInstance = new Rive({
      src: "/eyes.riv",
      canvas,
      artboard: artboardName,
      autoplay: true,
      stateMachines: "State Machine 1",
      layout: new Layout({
        fit: Fit.Contain,
        alignment: Alignment.Center,
      }),
      autoBind: true,
      onLoad: () => {
        if (isCancelled || !riveInstance) {
          return;
        }

        riveInstance.resizeDrawingSurfaceToCanvas();
        const viewModel =
          riveInstance.viewModelByName("ViewModel1") ??
          riveInstance.defaultViewModel();

        if (viewModel) {
          onDetectedInstances(viewModel.instanceNames.slice(0, eyeCount));
        }
      },
    });

    return () => {
      isCancelled = true;
      riveInstance?.cleanup();
    };
  }, [artboardName, onDetectedInstances]);

  return (
    <button
      className="eye-body"
      data-eye-id={id}
      type="button"
      aria-label={`Drag ${instanceName}`}
      onPointerDown={(event) => onPointerDown(event, id)}
    >
      <canvas ref={canvasRef} width={eyeSize * 2} height={eyeSize * 2} />
    </button>
  );
}

function App() {
  return (
    <main className="homepage">
      <div className="side-rule side-rule--left" aria-hidden="true" />
      <div className="side-rule side-rule--right" aria-hidden="true" />

      <div className="content-shell">
        <MetaRow lead="Hover over to the illustrations" value="999" />
        <IllustrationCarousel />
        <MetaRow lead="Illustration made by" value="Metafy" />
        <MetaRow lead="Animation made by" value="Me of course" />
        <MetaRow value="Total: Crazy interactive animation" align="end" />
      </div>
    </main>
  );
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
