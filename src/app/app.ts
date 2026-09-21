import { Component, inject } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, skip } from 'rxjs';

declare global {
  interface Window {
    goatcounter?: { count(vars: { path: string }): void };
  }
}

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  constructor() {
    // GoatCounter's script counts the first page load itself; count the
    // client-side navigations after it, which it cannot see.
    inject(Router).events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      skip(1),
    ).subscribe(e => window.goatcounter?.count({ path: e.urlAfterRedirects }));
  }
}
