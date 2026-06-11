// Tiny hash-based router. Routes are registered as patterns like
// '#/project/:id'; the matching segment values are passed to the mount fn.
// Each mount fn receives (params, container) and returns { unmount } or void.
export function createRouter(container) {
  const routes = [];
  let current = null; // { unmount }

  function register(pattern, mount) {
    const parts = pattern.replace(/^#?\/?/, '').split('/').filter(Boolean);
    routes.push({ parts, mount });
  }

  function match(hash) {
    const path = hash.replace(/^#?\/?/, '').split('/').filter(Boolean);
    for (const route of routes) {
      if (route.parts.length !== path.length) continue;
      const params = {};
      let ok = true;
      for (let i = 0; i < route.parts.length; i++) {
        const seg = route.parts[i];
        if (seg.startsWith(':')) params[seg.slice(1)] = decodeURIComponent(path[i]);
        else if (seg !== path[i]) { ok = false; break; }
      }
      if (ok) return { route, params };
    }
    return null;
  }

  function resolve() {
    const hash = location.hash || '#/';
    const found = match(hash) || match('#/'); // fall back to landing
    if (current?.unmount) current.unmount();
    current = found ? (found.route.mount(found.params, container) || null) : null;
  }

  function go(path) {
    if (location.hash === path) resolve();
    else location.hash = path;
  }

  window.addEventListener('hashchange', resolve);

  return { register, go, start: resolve };
}
