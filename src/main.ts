import { App } from './core/App';

App.start().catch((err) => {
  console.error(err);
  const pre = document.createElement('pre');
  pre.style.color = '#ff8888';
  pre.style.padding = '16px';
  pre.textContent = `AstroAway failed to start:\n${err?.stack ?? err}`;
  document.body.appendChild(pre);
});
