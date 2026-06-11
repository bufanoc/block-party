// Landing page: hero card with the app name and attribution, a short blurb,
// and entry points. (Phase 0 placeholder — "Play together" is wired up in a
// later phase; for now it points at Solo so the page is usable.)
export function mountLanding(_params, container) {
  container.innerHTML = `
    <div id="landing">
      <div class="hero">
        <h1 class="hero-title">Block Party</h1>
        <p class="hero-by">By <a href="https://carminebufano.com" target="_blank" rel="noopener">carminebufano.com</a></p>
        <p class="hero-blurb">
          A 3D brick-building sandbox in your browser. Snap bricks onto the grid,
          stack them up, and build your World — solo today, together soon.
        </p>
        <div class="hero-actions">
          <a class="btn btn-primary" href="#/lobby">Play together</a>
          <a class="btn" href="#/solo">Solo sandbox</a>
        </div>
      </div>
    </div>
  `;
  return { unmount() { container.innerHTML = ''; } };
}
