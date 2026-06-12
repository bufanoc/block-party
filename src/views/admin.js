import { C2S, S2C, POLICY } from '../net/protocol.js';

// Creator-only admin overlay, mounted inside the builder for the project's
// owner. Lets the Creator approve/deny join requests, see who's present, and
// freeze / rename / set policy / clear / delete the project. All actions are
// re-checked server-side; this is just the UI.
export function mountAdminPanel(container, { socket, transport }) {
  const projectId = transport.projectId;
  const present = new Set(transport.present || []);
  const pending = new Set(transport.pending || []);

  const panel = document.createElement('div');
  panel.id = 'admin-panel';
  panel.innerHTML = `
    <div class="admin-head">⚙ Project admin</div>
    <div class="admin-row">
      <input id="admin-name" maxlength="40" />
      <button id="admin-rename" class="btn small">Rename</button>
    </div>
    <div class="admin-row">
      <span class="admin-label">Join</span>
      <select id="admin-policy">
        <option value="${POLICY.OPEN}">Open</option>
        <option value="${POLICY.APPROVAL}">Approval</option>
      </select>
      <button id="admin-freeze" class="btn small"></button>
    </div>
    <div class="admin-section">
      <div class="admin-label">Here now (<span id="admin-present-count">0</span>)</div>
      <ul id="admin-present" class="admin-list"></ul>
    </div>
    <div class="admin-section" id="admin-pending-section">
      <div class="admin-label">Requests (<span id="admin-pending-count">0</span>)</div>
      <ul id="admin-pending" class="admin-list"></ul>
    </div>
    <div class="admin-row admin-danger">
      <button id="admin-clear" class="btn small">Clear build</button>
      <button id="admin-delete" class="btn small danger">Delete</button>
    </div>
    <p class="admin-err" id="admin-err"></p>
  `;
  container.appendChild(panel);

  const $ = (sel) => panel.querySelector(sel);
  const nameInput = $('#admin-name');
  const policySel = $('#admin-policy');
  const freezeBtn = $('#admin-freeze');
  const presentEl = $('#admin-present');
  const pendingEl = $('#admin-pending');
  const errEl = $('#admin-err');

  nameInput.value = transport.meta?.name || '';
  policySel.value = transport.meta?.policy || POLICY.OPEN;
  let frozen = !!transport.getSnapshot().frozen;
  function paintFreeze() { freezeBtn.textContent = frozen ? 'Unfreeze' : 'Freeze'; freezeBtn.classList.toggle('on', frozen); }
  paintFreeze();

  function showErr(reason) {
    errEl.textContent = reason ? `Couldn't do that (${reason})` : '';
    if (reason) setTimeout(() => { errEl.textContent = ''; }, 3000);
  }

  function renderPresent() {
    $('#admin-present-count').textContent = String(present.size);
    presentEl.innerHTML = '';
    for (const u of [...present].sort()) {
      const li = document.createElement('li');
      li.textContent = u;
      if (u === transport.meta?.creator) {
        const tag = document.createElement('span');
        tag.className = 'you-tag';
        tag.textContent = ' (owner)';
        li.appendChild(tag);
      }
      presentEl.appendChild(li);
    }
  }

  function renderPending() {
    $('#admin-pending-count').textContent = String(pending.size);
    $('#admin-pending-section').style.display = pending.size ? '' : 'none';
    pendingEl.innerHTML = '';
    for (const u of [...pending].sort()) {
      const li = document.createElement('li');
      const who = document.createElement('span');
      who.textContent = u;
      const ok = document.createElement('button');
      ok.className = 'btn tiny'; ok.textContent = '✓';
      ok.title = `Approve ${u}`;
      ok.addEventListener('click', () => decide(C2S.JOIN_APPROVE, u));
      const no = document.createElement('button');
      no.className = 'btn tiny danger'; no.textContent = '✕';
      no.title = `Deny ${u}`;
      no.addEventListener('click', () => decide(C2S.JOIN_DENY, u));
      li.append(who, ok, no);
      pendingEl.appendChild(li);
    }
  }

  function decide(event, username) {
    socket.emit(event, { projectId, username }, (res) => {
      if (res?.ok) { pending.delete(username); renderPending(); }
      else showErr(res?.reason);
    });
  }

  renderPresent();
  renderPending();

  // ---- actions ----
  const onRename = () => {
    const name = nameInput.value.trim();
    socket.emit(C2S.PROJECT_RENAME, { projectId, name }, (res) => { if (!res?.ok) showErr(res?.reason); });
  };
  const onPolicy = () => {
    socket.emit(C2S.PROJECT_SET_POLICY, { projectId, policy: policySel.value }, (res) => { if (!res?.ok) showErr(res?.reason); });
  };
  const onFreeze = () => {
    socket.emit(C2S.PROJECT_FREEZE, { projectId, frozen: !frozen }, (res) => { if (!res?.ok) showErr(res?.reason); });
  };
  const onClear = () => {
    if (!confirm('Clear all bricks in this project?')) return;
    socket.emit(C2S.PROJECT_CLEAR, { projectId }, (res) => { if (!res?.ok) showErr(res?.reason); });
  };
  const onDelete = () => {
    if (!confirm('Delete this project permanently? This cannot be undone.')) return;
    socket.emit(C2S.PROJECT_DELETE, { projectId }, (res) => { if (!res?.ok) showErr(res?.reason); });
    // the project:deleted broadcast routes everyone (incl. us) back to the lobby
  };

  $('#admin-rename').addEventListener('click', onRename);
  policySel.addEventListener('change', onPolicy);
  freezeBtn.addEventListener('click', onFreeze);
  $('#admin-clear').addEventListener('click', onClear);
  $('#admin-delete').addEventListener('click', onDelete);

  // ---- live updates (filtered by this project) ----
  const onMembers = (d) => { if (d.projectId !== projectId) return; present.clear(); for (const u of d.members) present.add(u); renderPresent(); };
  const onRequest = (d) => { if (d.projectId !== projectId) return; pending.add(d.username); renderPending(); };
  const onFrozenEvt = (d) => { if (d.projectId !== projectId) return; frozen = !!d.frozen; paintFreeze(); };
  const onPolicyEvt = (d) => { if (d.projectId !== projectId) return; policySel.value = d.policy; };
  const onRenamedEvt = (d) => { if (d.projectId !== projectId) return; if (document.activeElement !== nameInput) nameInput.value = d.name; };

  socket.on(S2C.MEMBERS_UPDATE, onMembers);
  socket.on(S2C.JOIN_REQUEST, onRequest);
  socket.on(S2C.PROJECT_FROZEN, onFrozenEvt);
  socket.on(S2C.PROJECT_POLICY, onPolicyEvt);
  socket.on(S2C.PROJECT_RENAMED, onRenamedEvt);

  return {
    unmount() {
      socket.off(S2C.MEMBERS_UPDATE, onMembers);
      socket.off(S2C.JOIN_REQUEST, onRequest);
      socket.off(S2C.PROJECT_FROZEN, onFrozenEvt);
      socket.off(S2C.PROJECT_POLICY, onPolicyEvt);
      socket.off(S2C.PROJECT_RENAMED, onRenamedEvt);
      panel.remove();
    },
  };
}
