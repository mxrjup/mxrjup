import { Component } from '@angular/core';

@Component({
    selector: 'app-computer-wrapper',
    standalone: true,
    template: `
    <iframe 
      src="/computer/index.html" 
      [style.width.%]="100"
      [style.height.vh]="100"
      [style.border]="'none'"
      [style.display]="'block'"
      [style.margin]="0"
      [style.padding]="0">
    </iframe>
  `,
    styles: [`
    :host {
      display: block;
      width: 100%;
      height: 100vh;
      margin: 0;
      padding: 0;
      overflow: hidden;
    }
  `]
})
export class ComputerWrapperComponent { }
