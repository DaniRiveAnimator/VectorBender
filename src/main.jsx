import React, {
  StrictMode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createRoot } from "react-dom/client";
import { Alignment, Fit, Layout, Rive } from "@rive-app/canvas";
import "./styles.css";

const carouselRows = Array.from({ length: 7 }, (_, index) => index);
const eyeSize = 72;
const fallbackCollisionRadius = 34;
const collisionSampleCount = 48;
const collisionAlphaThreshold = 12;
const basePanelWidth = 740;
const basePanelHeight = 370;
const riveAssetPath = `${import.meta.env.BASE_URL}eyes.riv`;
const defaultCollisionProfile = Array.from(
  { length: collisionSampleCount },
  () => fallbackCollisionRadius
);

function createSpawnEyeLayout(count) {
  const columns = Math.min(6, Math.max(4, Math.ceil(Math.sqrt(count || 1))));

  return Array.from({ length: count }, (_, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const centeredColumn = column - (columns - 1) / 2;

    return {
      x:
        basePanelWidth / 2 -
        eyeSize / 2 +
        centeredColumn * 18 +
        (row % 2) * 10,
      y: -230 - row * 86 - column * 14,
      vx: centeredColumn * 4,
    };
  });
}

function sortArtboardsByName(artboards) {
  return [...artboards].sort((first, second) =>
    first.artboardName.localeCompare(second.artboardName, undefined, {
      numeric: true,
      sensitivity: "base",
    })
  );
}

function getRiveArtboards(contents, viewModelInstanceNames) {
  const artboards = contents?.artboards ?? [];

  return sortArtboardsByName(
    artboards.map((artboard, index) => ({
      artboardName: artboard.name,
      instanceName: viewModelInstanceNames[index] ?? `Instance ${artboard.name}`,
      stateMachineNames: (artboard.stateMachines ?? [])
        .map((stateMachine) => stateMachine.name)
        .filter(Boolean),
    }))
  ).map((artboard, index) => ({ ...artboard, id: index }));
}

function extractCollisionProfile(canvas) {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return defaultCollisionProfile;
  }

  let imageData;
  try {
    imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  } catch {
    return defaultCollisionProfile;
  }

  const { data, width, height } = imageData;
  const centerX = width / 2;
  const centerY = height / 2;
  const maxRadius = Math.min(width, height) / 2;
  const scale = eyeSize / Math.min(width, height);

  return Array.from({ length: collisionSampleCount }, (_, index) => {
    const angle = (index / collisionSampleCount) * Math.PI * 2;
    const directionX = Math.cos(angle);
    const directionY = Math.sin(angle);

    for (let radius = maxRadius; radius >= 0; radius -= 1) {
      const x = Math.round(centerX + directionX * radius);
      const y = Math.round(centerY + directionY * radius);

      if (x < 0 || y < 0 || x >= width || y >= height) {
        continue;
      }

      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha > collisionAlphaThreshold) {
        return Math.max(12, radius * scale);
      }
    }

    return 12;
  });
}

function getCollisionRadius(eye, angle) {
  const profile = eye.collisionProfile ?? defaultCollisionProfile;
  const normalizedAngle = (angle + Math.PI * 2) % (Math.PI * 2);
  const index =
    Math.round((normalizedAngle / (Math.PI * 2)) * profile.length) %
    profile.length;

  return profile[index];
}

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
  const eyeNodesRef = useRef(new Map());
  const eyesRef = useRef([]);
  const dragRef = useRef(null);
  const frameRef = useRef(0);
  const dragCleanupRef = useRef(null);
  const [eyeInstances, setEyeInstances] = useState([]);
  const [detectedInstances, setDetectedInstances] = useState([]);
  const spawnEyeLayout = useMemo(
    () => createSpawnEyeLayout(eyeInstances.length),
    [eyeInstances.length]
  );

  const handleRiveMetadataLoaded = useCallback((metadata) => {
    const nextEyeInstances = getRiveArtboards(
      metadata.contents,
      metadata.viewModelInstanceNames
    );

    setEyeInstances(nextEyeInstances);
    setDetectedInstances(metadata.viewModelInstanceNames);
  }, []);

  const registerEyeNode = useCallback((id, node) => {
    if (node) {
      eyeNodesRef.current.set(id, node);
    } else {
      eyeNodesRef.current.delete(id);
    }
  }, []);

  const handleCollisionProfileReady = useCallback((id, collisionProfile) => {
    const eye = eyesRef.current[id];
    if (eye) {
      eye.collisionProfile = collisionProfile;
    }
  }, []);

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
        collisionProfile: defaultCollisionProfile,
      })),
    [eyeInstances, spawnEyeLayout]
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
  }, [spawnEyeLayout]);

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

      eyesRef.current.forEach((eye) => {
        if (eye.isActive && !eye.isDragging) {
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
        const node = eyeNodesRef.current.get(eye.id);
        if (node && !eye.isDragging) {
          node.style.transform = `translate3d(${eye.x}px, ${eye.y}px, 0)`;
        }
      });

      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frameRef.current);
      dragCleanupRef.current?.();
    };
  }, []);

  const moveDraggedEye = useCallback((event) => {
    const playground = playgroundRef.current;
    const drag = dragRef.current;
    if (!playground || !drag || drag.pointerId !== event.pointerId) {
      return;
    }

    const eye = eyesRef.current[drag.id];
    if (!eye) {
      return;
    }

    const now = performance.now();
    const dt = Math.max((now - drag.lastTime) / 1000, 0.001);

    event.preventDefault();
    eye.x = Math.min(
      playground.clientWidth - eyeSize,
      Math.max(0, event.clientX - drag.boundsLeft - drag.offsetX)
    );
    eye.y = Math.min(
      playground.clientHeight - eyeSize,
      Math.max(0, event.clientY - drag.boundsTop - drag.offsetY)
    );
    eye.vx = (event.clientX - drag.lastX) / dt;
    eye.vy = (event.clientY - drag.lastY) / dt;

    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    drag.lastTime = now;

    const maxX = playground.clientWidth - eyeSize;
    const maxY = playground.clientHeight - eyeSize;
    for (let iteration = 0; iteration < 3; iteration += 1) {
      resolveEyeCollisions(eyesRef.current);
      eyesRef.current.forEach((nextEye) => constrainToPanel(nextEye, maxX, maxY));
    }

    eyesRef.current.forEach((nextEye) => {
      const node = eyeNodesRef.current.get(nextEye.id);
      if (node) {
        node.style.transform = `translate3d(${nextEye.x}px, ${nextEye.y}px, 0)`;
      }
    });
  }, []);

  const stopDraggingEye = useCallback((event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    const eye = eyesRef.current[drag.id];
    const node = eyeNodesRef.current.get(drag.id);
    if (eye) {
      eye.isDragging = false;
      eye.isActive = true;
      eye.vx = Math.max(-1200, Math.min(1200, eye.vx));
      eye.vy = Math.max(-1200, Math.min(1200, eye.vy));
    }

    node?.classList.remove("is-dragging");
    try {
      drag.target.releasePointerCapture?.(event.pointerId);
    } catch {
      // Pointer capture can already be gone if the browser canceled the gesture.
    }
    dragCleanupRef.current?.();
    dragCleanupRef.current = null;
    dragRef.current = null;
  }, []);

  const handlePointerDown = useCallback((event, id) => {
    const playground = playgroundRef.current;
    const eye = eyesRef.current[id];
    if (!playground || !eye) {
      return;
    }

    event.preventDefault();
    dragCleanupRef.current?.();
    event.currentTarget.setPointerCapture(event.pointerId);
    const bounds = playground.getBoundingClientRect();
    const node = eyeNodesRef.current.get(id);

    eye.isDragging = true;
    eye.isActive = true;
    eye.vx = 0;
    eye.vy = 0;

    dragRef.current = {
      id,
      pointerId: event.pointerId,
      offsetX: event.clientX - bounds.left - eye.x,
      offsetY: event.clientY - bounds.top - eye.y,
      boundsLeft: bounds.left,
      boundsTop: bounds.top,
      target: event.currentTarget,
      lastX: event.clientX,
      lastY: event.clientY,
      lastTime: performance.now(),
    };

    node?.classList.add("is-dragging");

    window.addEventListener("pointermove", moveDraggedEye, { passive: false });
    window.addEventListener("pointerup", stopDraggingEye, { passive: false });
    window.addEventListener("pointercancel", stopDraggingEye, {
      passive: false,
    });
    dragCleanupRef.current = () => {
      window.removeEventListener("pointermove", moveDraggedEye);
      window.removeEventListener("pointerup", stopDraggingEye);
      window.removeEventListener("pointercancel", stopDraggingEye);
    };
  }, [moveDraggedEye, stopDraggingEye]);

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
      >
        {eyeInstances.map((eye) => (
          <RiveEye
            key={eye.id}
            {...eye}
            onCollisionProfileReady={handleCollisionProfileReady}
            onPointerDown={handlePointerDown}
            registerEyeNode={registerEyeNode}
          />
        ))}
      </div>
      <RiveMetadataProbe onLoaded={handleRiveMetadataLoaded} />
      <span className="sr-only">
        Loaded {eyeInstances.length} artboards and {detectedInstances.length}{" "}
        ViewModel1 instances from eyes.riv for draggable eye physics.
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
      const normalX = dx / distance;
      const normalY = dy / distance;
      const angle = Math.atan2(normalY, normalX);
      const minDistance =
        getCollisionRadius(first, angle) +
        getCollisionRadius(second, angle + Math.PI);

      if (distance >= minDistance) {
        continue;
      }

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
  stateMachineNames,
  onCollisionProfileReady,
  onPointerDown,
  registerEyeNode,
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
      src: riveAssetPath,
      canvas,
      artboard: artboardName,
      autoplay: true,
      stateMachines: stateMachineNames.length ? stateMachineNames : undefined,
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
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (!isCancelled) {
              onCollisionProfileReady(id, extractCollisionProfile(canvas));
            }
          });
        });
      },
    });

    return () => {
      isCancelled = true;
      riveInstance?.cleanup();
    };
  }, [artboardName, id, onCollisionProfileReady, stateMachineNames]);

  return (
    <button
      className="eye-body"
      data-eye-id={id}
      ref={(node) => registerEyeNode(id, node)}
      type="button"
      aria-label={`Drag ${instanceName}`}
      onPointerDown={(event) => onPointerDown(event, id)}
    >
      <canvas ref={canvasRef} width={eyeSize * 2} height={eyeSize * 2} />
    </button>
  );
}

function RiveMetadataProbe({ onLoaded }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return undefined;
    }

    let riveInstance;
    let isCancelled = false;

    riveInstance = new Rive({
      src: riveAssetPath,
      canvas,
      autoplay: false,
      onLoad: () => {
        if (isCancelled || !riveInstance) {
          return;
        }

        const viewModel =
          riveInstance.viewModelByName("ViewModel1") ??
          riveInstance.defaultViewModel();
        const viewModelInstanceNames = viewModel?.instanceNames ?? [];
        const contents = riveInstance.contents ?? {};

        console.info("Detected Rive contents", {
          artboards: contents.artboards?.map((artboard) => ({
            name: artboard.name,
            stateMachines: artboard.stateMachines?.map(
              (stateMachine) => stateMachine.name
            ),
          })),
          viewModel1Instances: viewModelInstanceNames,
        });

        onLoaded({ contents, viewModelInstanceNames });
      },
    });

    return () => {
      isCancelled = true;
      riveInstance?.cleanup();
    };
  }, [onLoaded]);

  return (
    <canvas
      aria-hidden="true"
      className="rive-metadata-probe"
      ref={canvasRef}
      width="1"
      height="1"
    />
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
