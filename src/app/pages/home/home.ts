import { Component, NgZone, OnDestroy, AfterViewInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import * as THREE from 'three';
import { AsciiEffect } from 'three/examples/jsm/effects/AsciiEffect.js';

// How many characters the effect draws per pixel of window. This is
// AsciiEffect's own default, passed explicitly because the render size below is
// derived from it.
const ASCII_RESOLUTION = 0.15;

// The knot turns slowly enough that 30 frames a second is indistinguishable
// from 60, and every frame costs a full re-parse of the character grid.
const FRAME_MS = 1000 / 30;

/** The character grid AsciiEffect derives from a window size. */
function asciiGrid(width: number, height: number) {
  return {
    width: Math.floor(width * ASCII_RESOLUTION),
    height: Math.floor(height * ASCII_RESOLUTION),
  };
}

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class HomeComponent implements AfterViewInit, OnDestroy {
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private effect!: AsciiEffect;
  private animationId: number | null = null;
  private sphere!: THREE.Mesh;
  private onResize?: () => void;

  constructor(private ngZone: NgZone) { }

  ngAfterViewInit(): void {
    // Small delay to ensure layout is stable
    setTimeout(() => this.initThree(), 0);
  }

  ngOnDestroy(): void {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
    if (this.onResize) {
      window.removeEventListener('resize', this.onResize);
    }
    if (this.renderer) {
      this.renderer.dispose();
    }
  }

  /**
   * Draw the scene straight at the size of the character grid. `false` stops
   * the renderer writing a CSS size onto a canvas that is never in the page.
   */
  private setRenderSize(width: number, height: number): void {
    const grid = asciiGrid(width, height);
    this.renderer.setSize(grid.width, grid.height, false);
  }

  initThree() {
    this.ngZone.runOutsideAngular(() => {
      const container = document.getElementById('canvas-container');
      if (!container) return;

      // Init Scene
      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(0, 0, 0); // Black background

      // Camera
      const aspect = window.innerWidth / window.innerHeight;
      this.camera = new THREE.PerspectiveCamera(70, aspect, 1, 1000);
      this.camera.position.y = 150;
      this.camera.position.z = 500;

      // Lights
      const pointLight1 = new THREE.PointLight(0xffffff, 3, 0, 0);
      pointLight1.position.set(500, 500, 500);
      this.scene.add(pointLight1);

      const pointLight2 = new THREE.PointLight(0xffffff, 1, 0, 0);
      pointLight2.position.set(-500, -500, -500);
      this.scene.add(pointLight2);

      // Object (TorusKnot is clearer in ASCII than a sphere)
      this.sphere = new THREE.Mesh(
        new THREE.TorusKnotGeometry(200, 60, 100, 16),
        new THREE.MeshPhongMaterial({ flatShading: true })
      );
      this.scene.add(this.sphere);

      // Renderer
      this.renderer = new THREE.WebGLRenderer();

      // ASCII Effect
      // Usage: AsciiEffect( renderer, charSet, options )
      this.effect = new AsciiEffect(this.renderer, ' .:-+*=%@#', {
        invert: true,
        resolution: ASCII_RESOLUTION,
      });
      this.effect.setSize(window.innerWidth, window.innerHeight);

      // Nothing ever looks at the WebGL canvas: the effect reads it back with
      // drawImage, shrinks it to the character grid and throws it away. Sizing
      // it to the window meant rendering 1.3 million pixels a frame to sample
      // 29 thousand of them, so setSize's own full-window call is undone here.
      // Same aspect ratio, so the picture is unchanged.
      this.setRenderSize(window.innerWidth, window.innerHeight);
      this.effect.domElement.style.color = 'white';
      this.effect.domElement.style.backgroundColor = 'transparent'; // Let CSS handle bg if needed, or black

      // Clear container and add effect element
      container.innerHTML = '';
      container.appendChild(this.effect.domElement);

      // Animate
      const start = Date.now();
      let lastFrame = 0;
      const animate = (now: number) => {
        this.animationId = requestAnimationFrame(animate);
        if (now - lastFrame < FRAME_MS) return;
        lastFrame = now;

        const timer = Date.now() - start;

        this.sphere.position.y = Math.abs(Math.sin(timer * 0.002)) * 150;
        this.sphere.rotation.x = timer * 0.0003;
        this.sphere.rotation.z = timer * 0.0002;

        this.effect.render(this.scene, this.camera);
      };

      this.animationId = requestAnimationFrame(animate);

      // Resize. A phone fires `resize` on every scroll, because hiding the URL
      // bar changes innerHeight; rebuilding the ASCII grid that often makes the
      // page stutter under the finger. Only a width change is a real rotation or
      // window resize, so height-only changes are ignored.
      let lastWidth = window.innerWidth;
      this.onResize = () => {
        const width = window.innerWidth;
        if (width === lastWidth) return;
        lastWidth = width;

        const height = window.innerHeight;
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();

        this.effect.setSize(width, height);
        this.setRenderSize(width, height);
      };
      window.addEventListener('resize', this.onResize);
    });
  }
}
