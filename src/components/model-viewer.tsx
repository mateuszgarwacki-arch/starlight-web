"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Box, Download, Loader2, RotateCcw, ZoomIn, ZoomOut, X, Maximize2, Minimize2 } from "lucide-react";

interface ModelViewerProps {
  url: string;
  fileName: string;
  onClose: () => void;
}

export function ModelViewer({ url, fileName, onClose }: ModelViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<any>(null);
  const sceneRef = useRef<any>(null);
  const cameraRef = useRef<any>(null);
  const controlsRef = useRef<any>(null);
  const animFrameRef = useRef<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const initScene = useCallback(async () => {
    if (!containerRef.current) return;

    try {
      // Dynamic import to avoid SSR issues
      const THREE = await import("three");
      const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
      const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
      const { RoomEnvironment } = await import("three/examples/jsm/environments/RoomEnvironment.js");

      const container = containerRef.current;
      const width = container.clientWidth;
      const height = container.clientHeight;

      // Scene
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x4a6741);
      sceneRef.current = scene;

      // Camera
      const camera = new THREE.PerspectiveCamera(45, width / height, 0.01, 1000);
      camera.position.set(2, 1.5, 2);
      cameraRef.current = camera;

      // Renderer
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 0.7;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      container.appendChild(renderer.domElement);
      rendererRef.current = renderer;

      // Controls
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.minDistance = 0.1;
      controls.maxDistance = 50;
      controls.target.set(0, 0, 0);
      controlsRef.current = controls;

      // HDR Environment — procedural studio lighting via RoomEnvironment
      // Gives materials something to reflect, creating natural depth on white geometry
      const pmremGenerator = new THREE.PMREMGenerator(renderer);
      pmremGenerator.compileEquirectangularShader();
      const envTexture = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
      scene.environment = envTexture;
      pmremGenerator.dispose();

      // Directional key light from upper-right for readable shadows
      const keyLight = new THREE.DirectionalLight(0xffffff, 0.8);
      keyLight.position.set(4, 10, 4);
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.width = 2048;
      keyLight.shadow.mapSize.height = 2048;
      scene.add(keyLight);

      // Soft fill from opposite side to prevent harsh shadows
      const fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
      fillLight.position.set(-3, 6, -2);
      scene.add(fillLight);

      // Ground plane — subtle grid
      const gridHelper = new THREE.GridHelper(10, 20, 0xcccccc, 0xe8e8e8);
      scene.add(gridHelper);

      // Load model
      const loader = new GLTFLoader();
      loader.load(
        url,
        (gltf) => {
          const model = gltf.scene;

          // Compute bounding box to auto-centre and fit
          const box = new THREE.Box3().setFromObject(model);
          const centre = box.getCenter(new THREE.Vector3());
          const size = box.getSize(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z);

          // Centre model at origin
          model.position.sub(centre);

          // Position ground at bottom of model
          gridHelper.position.y = -size.y / 2;

          // Enable shadows + fix SketchUp materials on all meshes
          model.traverse((child: any) => {
            if (child.isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
              // SketchUp exports often have wrong PBR values
              // Reset to matte non-metallic — works well under HDR environment
              if (child.material) {
                const mats = Array.isArray(child.material) ? child.material : [child.material];
                mats.forEach((mat: any) => {
                  if (mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial) {
                    if (!mat.metalnessMap) mat.metalness = 0.0;
                    if (!mat.roughnessMap) mat.roughness = 0.85;
                    mat.envMapIntensity = 0.6; // tone down HDR reflections
                    mat.needsUpdate = true;
                  }
                });
              }
            }
          });

          scene.add(model);

          // Fit camera to model
          const fitOffset = 1.5;
          const dist = maxDim * fitOffset / Math.tan((camera.fov * Math.PI) / 360);
          camera.position.set(dist * 0.7, dist * 0.5, dist * 0.7);
          camera.near = maxDim / 100;
          camera.far = maxDim * 100;
          camera.updateProjectionMatrix();

          controls.target.set(0, 0, 0);
          controls.minDistance = maxDim * 0.1;
          controls.maxDistance = maxDim * 10;
          controls.update();

          setLoading(false);
        },
        undefined,
        (err: any) => {
          console.error("Model load error:", err);
          setError("Failed to load 3D model. The file may be corrupted or in an unsupported format.");
          setLoading(false);
        }
      );

      // Animation loop
      const animate = () => {
        animFrameRef.current = requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
      };
      animate();

      // Resize handler
      const handleResize = () => {
        if (!containerRef.current) return;
        const w = containerRef.current.clientWidth;
        const h = containerRef.current.clientHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      };
      window.addEventListener("resize", handleResize);

      // Cleanup function
      return () => {
        window.removeEventListener("resize", handleResize);
        cancelAnimationFrame(animFrameRef.current);
        controls.dispose();
        renderer.dispose();
        if (container.contains(renderer.domElement)) {
          container.removeChild(renderer.domElement);
        }
      };
    } catch (err: any) {
      console.error("Three.js init error:", err);
      setError("Failed to initialise 3D viewer: " + (err.message || "Unknown error"));
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    const cleanup = initScene();
    return () => { cleanup?.then(fn => fn?.()); };
  }, [initScene]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(animFrameRef.current);
      rendererRef.current?.dispose();
    };
  }, []);

  const handleResetView = () => {
    if (!controlsRef.current || !cameraRef.current) return;
    controlsRef.current.reset();
  };

  const handleDownload = () => {
    window.open(url, "_blank");
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
    // Trigger resize after state change
    setTimeout(() => {
      window.dispatchEvent(new Event("resize"));
    }, 50);
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-[70] flex items-center justify-center p-2 sm:p-4" onClick={onClose}>
      <div
        className={`bg-surface rounded-xl overflow-hidden flex flex-col transition-all duration-200 ${
          isFullscreen ? "w-full h-full rounded-none" : "w-full max-w-4xl h-[85vh] max-h-[700px]"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header toolbar */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-subtle bg-surface shrink-0">
          <div className="flex items-center gap-2">
            <Box className="h-4 w-4 text-starlight-red" />
            <span className="text-sm font-semibold text-navy truncate max-w-[200px] sm:max-w-none">{fileName}</span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={handleResetView} className="p-1.5 text-muted hover:text-navy rounded-lg hover:bg-surface-dim transition-colors" title="Reset view">
              <RotateCcw className="h-4 w-4" />
            </button>
            <button onClick={handleDownload} className="p-1.5 text-muted hover:text-navy rounded-lg hover:bg-surface-dim transition-colors" title="Download model">
              <Download className="h-4 w-4" />
            </button>
            <button onClick={toggleFullscreen} className="p-1.5 text-muted hover:text-navy rounded-lg hover:bg-surface-dim transition-colors" title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}>
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
            <button onClick={onClose} className="p-1.5 text-muted hover:text-starlight-red rounded-lg hover:bg-surface-dim transition-colors ml-1" title="Close">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* 3D Viewport */}
        <div className="flex-1 relative bg-base">
          <div ref={containerRef} className="absolute inset-0" />

          {/* Loading overlay */}
          {loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-base/90">
              <Loader2 className="h-8 w-8 text-starlight-blue animate-spin" />
              <p className="text-sm text-muted mt-3">Loading 3D model...</p>
            </div>
          )}

          {/* Error state */}
          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-base p-8">
              <Box className="h-10 w-10 text-starlight-red mb-3" />
              <p className="text-sm text-muted text-center max-w-sm">{error}</p>
              <button onClick={handleDownload} className="mt-4 px-4 py-2 bg-starlight-blue text-white text-sm rounded-lg hover:bg-navy transition-colors">
                Download Instead
              </button>
            </div>
          )}

          {/* Controls hint — fades after interaction */}
          {!loading && !error && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/50 text-white text-[10px] px-3 py-1.5 rounded-full pointer-events-none opacity-60">
              Drag to rotate · Scroll to zoom · Shift+drag to pan
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
