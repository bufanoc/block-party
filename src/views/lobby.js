import { getSocket, resetSocket } from '../net/client.js';
import { getUsername, clearSession } from '../net/session.js';
import { C2S, POLICY } from '../net/protocol.js';
import { AVAILABLE_SIZES, SIZE_BY_ID, DEFAULT_SIZE_ID, DEFAULT_BASE_COLOR } from '../sizes.js';

// Lobby: list / create / join projects. Approval enforcement and admin controls
// arrive in Phase 3; here any logged-in user can join any project (open).
export function mountLobby(_params, container) {
  const username = getUsername();
  container.innerHTML = `
    <div id="lobby">
      <header class="lobby-bar">
        <span class="lobby-title">Block Party</span>
        <span class="lobby-spacer"></span>
        <span class="lobby-user">Signed in as <strong></strong></span>
        <button class="btn small" id="btn-logout">Log out</button>
      </header>

      <section class="lobby-create">
        <h2>Start a new Project</h2>
        <form id="create-form" class="create-row">
          <input id="project-name" maxlength="40" placeholder="Project name" required />
          <select id="project-size" title="Baseplate size">
            ${AVAILABLE_SIZES.map((s) => `<option value="${s.id}"${s.id === DEFAULT_SIZE_ID ? ' selected' : ''}>${s.name} — ${s.grid}×${s.grid}</option>`).join('')}
          </select>
          <label class="color-field" title="Baseplate color">
            <span>Base</span>
            <input id="project-color" type="color" value="${DEFAULT_BASE_COLOR}" />
          </label>
          <select id="project-policy">
            <option value="${POLICY.OPEN}">Open — anyone can join</option>
            <option value="${POLICY.APPROVAL}">Approval required</option>
          </select>
          <button class="btn btn-primary" type="submit">Create</button>
        </form>
        <p class="form-err" id="create-err"></p>
      </section>

      <section class="lobby-list">
        <h2>Projects</h2>
        <div id="project-list" class="project-grid"></div>
        <p class="lobby-empty" id="lobby-empty" style="display:none">No projects yet — create the first one above.</p>
      </section>
    </div>
  `;

  container.querySelector('.lobby-user strong').textContent = username || '';

  const socket = getSocket();
  const listEl = container.querySelector('#project-list');
  const emptyEl = container.querySelector('#lobby-empty');
  const createForm = container.querySelector('#create-form');
  const createErr = container.querySelector('#create-err');
  const logoutBtn = container.querySelector('#btn-logout');

  // Build a project card with DOM nodes (names are user input — never innerHTML).
  function card(p) {
    const el = document.createElement('div');
    el.className = 'project-card';

    const name = document.createElement('div');
    name.className = 'project-name';
    name.textContent = p.name;

    const meta = document.createElement('div');
    meta.className = 'project-meta';
    meta.textContent = `by ${p.creator}`;

    const badges = document.createElement('div');
    badges.className = 'project-badges';

    const sizeMeta = SIZE_BY_ID[p.size];
    if (sizeMeta) {
      const sz = document.createElement('span');
      sz.className = 'badge size';
      sz.textContent = `${sizeMeta.name} ${sizeMeta.grid}²`;
      badges.appendChild(sz);
    }

    const policy = document.createElement('span');
    policy.className = 'badge';
    policy.textContent = p.policy === POLICY.APPROVAL ? 'Approval' : 'Open';
    badges.appendChild(policy);
    if (p.frozen) {
      const fr = document.createElement('span');
      fr.className = 'badge frozen';
      fr.textContent = 'Frozen';
      badges.appendChild(fr);
    }
    if (p.creator === username) {
      const mine = document.createElement('span');
      mine.className = 'badge mine';
      mine.textContent = 'Yours';
      badges.appendChild(mine);
    }

    const join = document.createElement('button');
    join.className = 'btn btn-primary small';
    join.textContent = 'Join';
    join.addEventListener('click', () => { location.hash = `#/project/${p.id}`; });

    el.append(name, meta, badges, join);
    return el;
  }

  function render(projects) {
    listEl.innerHTML = '';
    projects.sort((a, b) => b.createdAt - a.createdAt);
    for (const p of projects) listEl.appendChild(card(p));
    emptyEl.style.display = projects.length ? 'none' : '';
  }

  function refresh() {
    socket.emit(C2S.PROJECT_LIST, {}, (res) => {
      if (res?.ok) render(res.projects);
      else if (res?.reason === 'unauthenticated') location.hash = '#/login';
    });
  }

  function onCreate(e) {
    e.preventDefault();
    createErr.textContent = '';
    const name = container.querySelector('#project-name').value;
    const policy = container.querySelector('#project-policy').value;
    const size = container.querySelector('#project-size').value;
    const baseColor = container.querySelector('#project-color').value;
    socket.emit(C2S.PROJECT_CREATE, { name, policy, size, baseColor }, (res) => {
      if (res?.ok) location.hash = `#/project/${res.meta.id}`;
      else createErr.textContent = res?.reason === 'bad-name'
        ? 'Name must be 1–40 characters.'
        : 'Could not create project.';
    });
  }

  function onLogout() {
    clearSession();
    resetSocket();
    location.hash = '#/';
  }

  createForm.addEventListener('submit', onCreate);
  logoutBtn.addEventListener('click', onLogout);
  refresh();

  return {
    unmount() {
      createForm.removeEventListener('submit', onCreate);
      logoutBtn.removeEventListener('click', onLogout);
      container.innerHTML = '';
    },
  };
}
