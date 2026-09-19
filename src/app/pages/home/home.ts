import { Component, ElementRef, NgZone, OnDestroy, AfterViewInit, ViewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import * as THREE from 'three';
import { AsciiEffect } from 'three/examples/jsm/effects/AsciiEffect.js';

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

  constructor(private ngZone: NgZone) { }

  ngAfterViewInit(): void {
    // Small delay to ensure layout is stable
    setTimeout(() => this.initThree(), 0);
  }

  ngOnDestroy(): void {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
    if (this.renderer) {
      this.renderer.dispose();
    }
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
      this.renderer.setSize(window.innerWidth, window.innerHeight);

      // ASCII Effect
      // Usage: AsciiEffect( renderer, charSet, options )
      this.effect = new AsciiEffect(this.renderer, ' .:-+*=%@#', { invert: true });
      this.effect.setSize(window.innerWidth, window.innerHeight);
      this.effect.domElement.style.color = 'white';
      this.effect.domElement.style.backgroundColor = 'transparent'; // Let CSS handle bg if needed, or black

      // Clear container and add effect element
      container.innerHTML = '';
      container.appendChild(this.effect.domElement);

      // Animate
      const start = Date.now();
      const animate = () => {
        const timer = Date.now() - start;

        this.sphere.position.y = Math.abs(Math.sin(timer * 0.002)) * 150;
        this.sphere.rotation.x = timer * 0.0003;
        this.sphere.rotation.z = timer * 0.0002;

        this.effect.render(this.scene, this.camera);
        this.animationId = requestAnimationFrame(animate);
      };

      animate();

      // Resize
      window.addEventListener('resize', () => {
        if (!container) return;
        const width = window.innerWidth;
        const height = window.innerHeight;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();

        this.renderer.setSize(width, height);
        this.effect.setSize(width, height);
      });
    });
  }
}
