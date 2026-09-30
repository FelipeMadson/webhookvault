/**
 * Dashboard Web Embutido (Zero dependências externas, HTML5/CSS3/Vanilla JS moderno e responsivo).
 */
export function getEmbeddedDashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>WebhookVault — Local Webhook Inspector & Replayer</title>
  <style>
    :root {
      --bg: #090d16;
      --card-bg: #111827;
      --card-border: #1f2937;
      --text: #f3f4f6;
      --text-muted: #9ca3af;
      --accent: #6366f1;
      --accent-hover: #4f46e5;
      --success: #10b981;
      --error: #ef4444;
      --warning: #f59e0b;
      --code-bg: #030712;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
    }
    header {
      background: var(--card-bg);
      border-bottom: 1px solid var(--card-border);
      padding: 12px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-shrink: 0;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .brand-icon {
      font-size: 24px;
      background: rgba(99, 102, 241, 0.15);
      border: 1px solid rgba(99, 102, 241, 0.3);
      padding: 6px 10px;
      border-radius: 8px;
    }
    .brand h1 {
      font-size: 1.15rem;
      font-weight: 700;
      letter-spacing: -0.02em;
    }
    .brand span {
      font-size: 0.8rem;
      color: var(--text-muted);
      margin-left: 8px;
      background: #1f2937;
      padding: 2px 8px;
      border-radius: 999px;
    }
    .header-actions {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .stats-badge {
      font-size: 0.85rem;
      color: var(--text-muted);
      background: rgba(255,255,255,0.04);
      padding: 6px 12px;
      border-radius: 6px;
      border: 1px solid var(--card-border);
    }
    .stats-badge strong { color: var(--accent); }
    .btn {
      background: var(--accent);
      color: #fff;
      border: none;
      padding: 7px 14px;
      border-radius: 6px;
      font-size: 0.85rem;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s ease;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .btn:hover { background: var(--accent-hover); }
    .btn-secondary {
      background: #1f2937;
      color: var(--text);
    }
    .btn-secondary:hover { background: #374151; }
    .btn-danger {
      background: rgba(239, 68, 68, 0.2);
      color: var(--error);
      border: 1px solid rgba(239, 68, 68, 0.4);
    }
    .btn-danger:hover { background: rgba(239, 68, 68, 0.35); }
    
    .container {
      display: grid;
      grid-template-columns: 380px 1fr;
      flex: 1;
      overflow: hidden;
    }
    .sidebar {
      background: #0d131f;
      border-right: 1px solid var(--card-border);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .sidebar-search {
      padding: 12px;
      border-bottom: 1px solid var(--card-border);
    }
    .sidebar-search input {
      width: 100%;
      background: #1f2937;
      border: 1px solid #374151;
      padding: 8px 12px;
      border-radius: 6px;
      color: #fff;
      font-size: 0.85rem;
      outline: none;
    }
    .sidebar-search input:focus { border-color: var(--accent); }
    .webhook-list {
      flex: 1;
      overflow-y: auto;
      list-style: none;
    }
    .webhook-item {
      padding: 12px 16px;
      border-bottom: 1px solid rgba(31, 41, 55, 0.6);
      cursor: pointer;
      transition: background 0.15s ease;
    }
    .webhook-item:hover { background: rgba(99, 102, 241, 0.08); }
    .webhook-item.active {
      background: rgba(99, 102, 241, 0.15);
      border-left: 3px solid var(--accent);
    }
    .item-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
    }
    .method-badge {
      font-size: 0.7rem;
      font-weight: 800;
      padding: 2px 6px;
      border-radius: 4px;
      background: #374151;
      color: #fff;
    }
    .method-POST { background: #065f46; color: #34d399; }
    .method-PUT { background: #1e40af; color: #60a5fa; }
    .method-GET { background: #374151; color: #9ca3af; }
    .source-tag {
      font-size: 0.8rem;
      font-weight: 600;
      color: var(--text);
    }
    .time-tag {
      font-size: 0.75rem;
      color: var(--text-muted);
    }
    .item-bottom {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .id-tag {
      font-size: 0.75rem;
      color: var(--text-muted);
      font-family: monospace;
    }
    .hmac-badge {
      font-size: 0.68rem;
      font-weight: 700;
      padding: 2px 6px;
      border-radius: 4px;
    }
    .hmac-VALID { background: rgba(16, 185, 129, 0.2); color: var(--success); border: 1px solid rgba(16, 185, 129, 0.4); }
    .hmac-INVALID { background: rgba(239, 68, 68, 0.2); color: var(--error); border: 1px solid rgba(239, 68, 68, 0.4); }
    .hmac-UNVERIFIED { background: #1f2937; color: var(--text-muted); }

    .main-view {
      display: flex;
      flex-direction: column;
      background: var(--bg);
      overflow-y: auto;
      padding: 24px;
    }
    .empty-state {
      margin: auto;
      text-align: center;
      color: var(--text-muted);
    }
    .empty-state h3 { margin-bottom: 8px; color: var(--text); font-size: 1.2rem; }
    .empty-state p { font-size: 0.9rem; max-width: 400px; line-height: 1.5; }
    .curl-example {
      margin-top: 16px;
      background: var(--code-bg);
      padding: 12px 16px;
      border-radius: 8px;
      font-family: monospace;
      font-size: 0.85rem;
      color: #38bdf8;
      text-align: left;
      border: 1px solid var(--card-border);
    }

    .detail-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 10px;
      padding: 20px;
      margin-bottom: 20px;
    }
    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
      border-bottom: 1px solid var(--card-border);
      padding-bottom: 12px;
    }
    .card-header h2 { font-size: 1.1rem; font-weight: 700; }
    .card-actions { display: flex; gap: 8px; }
    pre {
      background: var(--code-bg);
      border: 1px solid var(--card-border);
      padding: 16px;
      border-radius: 8px;
      font-family: "Consolas", "Courier New", monospace;
      font-size: 0.85rem;
      overflow-x: auto;
      color: #e5e7eb;
      line-height: 1.45;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.85rem;
    }
    th, td {
      padding: 8px 12px;
      text-align: left;
      border-bottom: 1px solid var(--card-border);
    }
    th { color: var(--text-muted); font-weight: 600; width: 30%; }
    td { font-family: monospace; word-break: break-all; }

    /* Modal de Replay */
    .modal-backdrop {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.7);
      backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }
    .modal {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      width: 540px;
      max-width: 90vw;
      padding: 24px;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
    }
    .modal-title { font-size: 1.15rem; font-weight: 700; margin-bottom: 16px; }
    .form-group { margin-bottom: 16px; }
    .form-group label { display: block; font-size: 0.85rem; color: var(--text-muted); margin-bottom: 6px; }
    .form-group input {
      width: 100%;
      background: #030712;
      border: 1px solid var(--card-border);
      padding: 10px 12px;
      border-radius: 6px;
      color: #fff;
      font-size: 0.9rem;
    }
    .modal-footer {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      margin-top: 20px;
    }
    .replay-result-box {
      margin-top: 16px;
      padding: 12px;
      border-radius: 6px;
      font-size: 0.85rem;
      display: none;
    }
  </style>
</head>
<body>

  <header>
    <div class="brand">
      <div class="brand-icon">⚡</div>
      <div>
        <h1>WebhookVault <span>Local-First</span></h1>
      </div>
    </div>
    <div class="header-actions">
      <div class="stats-badge" id="statsBadge">
        Total: <strong id="statTotal">0</strong> | 
        HMAC Válido: <strong id="statValid" style="color:var(--success)">0</strong> | 
        Replays: <strong id="statReplays">0</strong>
      </div>
      <button class="btn btn-secondary" onclick="fetchWebhooks()">↻ Atualizar</button>
      <button class="btn btn-danger" onclick="clearAll()">🗑 Limpar</button>
    </div>
  </header>

  <div class="container">
    <!-- Sidebar -->
    <div class="sidebar">
      <div class="sidebar-search">
        <input type="text" id="searchInput" placeholder="Filtrar por origem, id ou payload..." oninput="filterList()">
      </div>
      <ul class="webhook-list" id="webhookList">
        <!-- Renderizado dinamicamente -->
      </ul>
    </div>

    <!-- Main View -->
    <div class="main-view" id="mainView">
      <div class="empty-state" id="emptyState">
        <h3>Nenhum webhook selecionado</h3>
        <p>Envie um webhook para interceptação e visualização em tempo real:</p>
        <div class="curl-example">
          curl -X POST http://localhost:4040/webhook/github \\<br>
          &nbsp;&nbsp;-H "Content-Type: application/json" \\<br>
          &nbsp;&nbsp;-d '{"action": "opened", "issue": {"title": "Bugfix"}}'
        </div>
      </div>

      <div id="detailView" style="display: none;">
        <div class="detail-card">
          <div class="card-header">
            <div>
              <h2 id="detailTitle">Webhook Details</h2>
              <span id="detailMeta" style="font-size:0.8rem; color:var(--text-muted);"></span>
            </div>
            <div class="card-actions">
              <button class="btn btn-secondary" onclick="copyAsCurl()">📋 Copiar cURL</button>
              <button class="btn" onclick="openReplayModal()">🚀 Disparar Replay</button>
            </div>
          </div>
          <div style="display: flex; gap: 10px; margin-bottom: 16px;">
            <span id="detailHmacBadge" class="hmac-badge"></span>
            <span id="detailMethodBadge" class="method-badge"></span>
            <span id="detailUrl" style="font-family: monospace; font-size: 0.85rem; color: var(--text-muted); align-self: center;"></span>
          </div>
        </div>

        <div class="detail-card">
          <div class="card-header">
            <h2>Corpo da Requisição (Payload)</h2>
            <button class="btn btn-secondary" style="padding:4px 8px; font-size:0.75rem;" onclick="copyRawBody()">Copiar JSON</button>
          </div>
          <pre id="detailBody"></pre>
        </div>

        <div class="detail-card">
          <div class="card-header">
            <h2>Cabeçalhos HTTP (Headers)</h2>
          </div>
          <table id="detailHeadersTable">
            <tbody></tbody>
          </table>
        </div>

        <div class="detail-card" id="replaysCard">
          <div class="card-header">
            <h2>Histórico de Replays Deste Webhook</h2>
          </div>
          <div id="replaysList" style="font-size:0.85rem; color:var(--text-muted);">(Nenhum replay disparado para este webhook)</div>
        </div>
      </div>
    </div>
  </div>

  <!-- Replay Modal -->
  <div class="modal-backdrop" id="replayModal" style="display: none;">
    <div class="modal">
      <div class="modal-title">🚀 Replay de Webhook</div>
      <div class="form-group">
        <label>URL de Destino (Endpoint Local da sua aplicação):</label>
        <input type="text" id="replayTargetUrl" value="http://localhost:3000/api/webhook" placeholder="http://localhost:3000/api/webhook">
      </div>
      <div class="form-group" style="display: flex; align-items: center; gap: 8px;">
        <input type="checkbox" id="replayRecalculateHmac" style="width: auto;">
        <label for="replayRecalculateHmac" style="margin: 0; cursor: pointer;">Recalcular assinatura HMAC com novo timestamp</label>
      </div>
      <div class="form-group" id="secretGroup" style="display: none;">
        <label>Secret para Assinatura HMAC:</label>
        <input type="password" id="replaySecret" placeholder="whsec_...">
      </div>

      <div id="replayResultBox" class="replay-result-box"></div>

      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeReplayModal()">Cancelar</button>
        <button class="btn" id="btnExecuteReplay" onclick="executeReplay()">Disparar Replay</button>
      </div>
    </div>
  </div>

  <script>
    let webhooks = [];
    let selectedWebhook = null;

    document.getElementById('replayRecalculateHmac').addEventListener('change', (e) => {
      document.getElementById('secretGroup').style.display = e.target.checked ? 'block' : 'none';
    });

    async function fetchWebhooks() {
      try {
        const res = await fetch('/api/webhooks');
        webhooks = await res.json();
        renderList(webhooks);
        fetchStats();
        if (selectedWebhook) {
          const updated = webhooks.find(w => w.id === selectedWebhook.id);
          if (updated) selectWebhook(updated);
        }
      } catch (err) {
        console.error('Falha ao buscar webhooks', err);
      }
    }

    async function fetchStats() {
      try {
        const res = await fetch('/api/stats');
        const s = await res.json();
        document.getElementById('statTotal').innerText = s.totalWebhooks || 0;
        document.getElementById('statValid').innerText = s.validHmacCount || 0;
        document.getElementById('statReplays').innerText = s.totalReplays || 0;
      } catch {}
    }

    function renderList(items) {
      const list = document.getElementById('webhookList');
      list.innerHTML = '';
      if (items.length === 0) {
        list.innerHTML = '<li style="padding:24px; text-align:center; color:var(--text-muted); font-size:0.85rem;">Nenhum webhook capturado ainda.</li>';
        return;
      }

      items.forEach(w => {
        const li = document.createElement('li');
        li.className = 'webhook-item' + (selectedWebhook && selectedWebhook.id === w.id ? ' active' : '');
        const timeAgo = formatTime(w.created_at);
        li.innerHTML = \`
          <div class="item-top">
            <span class="method-badge method-\${w.method}">\${w.method}</span>
            <span class="source-tag">\${escapeHtml(w.source)}</span>
            <span class="time-tag">\${timeAgo}</span>
          </div>
          <div class="item-bottom">
            <span class="id-tag">\${w.id.slice(0, 16)}</span>
            <span class="hmac-badge hmac-\${w.hmac_status}">\${w.hmac_status}</span>
          </div>
        \`;
        li.onclick = () => selectWebhook(w);
        list.appendChild(li);
      });
    }

    function selectWebhook(w) {
      selectedWebhook = w;
      document.querySelectorAll('.webhook-item').forEach(el => el.classList.remove('active'));
      const activeEl = Array.from(document.querySelectorAll('.webhook-item')).find(el => el.innerText.includes(w.id.slice(0, 16)));
      if (activeEl) activeEl.classList.add('active');

      document.getElementById('emptyState').style.display = 'none';
      document.getElementById('detailView').style.display = 'block';

      document.getElementById('detailTitle').innerText = \`Evento \${w.source.toUpperCase()}\`;
      document.getElementById('detailMeta').innerText = \`ID: \${w.id} | IP: \${w.client_ip || '127.0.0.1'} | Recebido: \${w.created_at}\`;
      document.getElementById('detailMethodBadge').innerText = w.method;
      document.getElementById('detailMethodBadge').className = \`method-badge method-\${w.method}\`;
      document.getElementById('detailHmacBadge').innerText = \`HMAC: \${w.hmac_status} (\${w.hmac_provider || 'none'})\`;
      document.getElementById('detailHmacBadge').className = \`hmac-badge hmac-\${w.hmac_status}\`;
      document.getElementById('detailUrl').innerText = w.url;

      // Body formatting
      let formattedBody = w.raw_body;
      try {
        const parsed = JSON.parse(w.raw_body);
        formattedBody = JSON.stringify(parsed, null, 2);
      } catch {}
      document.getElementById('detailBody').innerText = formattedBody;

      // Headers table
      const tbody = document.querySelector('#detailHeadersTable tbody');
      tbody.innerHTML = '';
      for (const [k, v] of Object.entries(w.headers || {})) {
        const tr = document.createElement('tr');
        tr.innerHTML = \`<th>\${escapeHtml(k)}</th><td>\${escapeHtml(String(v))}</td>\`;
        tbody.appendChild(tr);
      }

      fetchReplaysForWebhook(w.id);
    }

    async function fetchReplaysForWebhook(id) {
      try {
        const res = await fetch(\`/api/webhooks/\${id}/replays\`);
        const replays = await res.json();
        const container = document.getElementById('replaysList');
        if (!replays || replays.length === 0) {
          container.innerHTML = '<span style="color:var(--text-muted); font-size:0.85rem;">(Nenhum replay disparado para este webhook)</span>';
          return;
        }

        let html = '<table style="width:100%;"><thead><tr><th>Data</th><th>Destino</th><th>Status</th><th>Latência</th></tr></thead><tbody>';
        replays.forEach(r => {
          const statusColor = r.status_code >= 200 && r.status_code < 300 ? 'var(--success)' : 'var(--error)';
          html += \`<tr>
            <td>\${r.replayed_at}</td>
            <td style="color:var(--accent);">\${escapeHtml(r.target_url)}</td>
            <td><strong style="color:\${statusColor};">\${r.status_code}</strong></td>
            <td>\${r.duration_ms}ms</td>
          </tr>\`;
        });
        html += '</tbody></table>';
        container.innerHTML = html;
      } catch {}
    }

    function filterList() {
      const q = document.getElementById('searchInput').value.toLowerCase();
      const filtered = webhooks.filter(w => 
        w.source.toLowerCase().includes(q) ||
        w.id.toLowerCase().includes(q) ||
        (w.raw_body && w.raw_body.toLowerCase().includes(q))
      );
      renderList(filtered);
    }

    function openReplayModal() {
      document.getElementById('replayResultBox').style.display = 'none';
      document.getElementById('replayModal').style.display = 'flex';
    }

    function closeReplayModal() {
      document.getElementById('replayModal').style.display = 'none';
    }

    async function executeReplay() {
      if (!selectedWebhook) return;
      const targetUrl = document.getElementById('replayTargetUrl').value;
      const recalculateHmac = document.getElementById('replayRecalculateHmac').checked;
      const secret = document.getElementById('replaySecret').value;
      const btn = document.getElementById('btnExecuteReplay');
      const box = document.getElementById('replayResultBox');

      btn.disabled = true;
      btn.innerText = 'Enviando...';

      try {
        const res = await fetch(\`/api/webhooks/\${selectedWebhook.id}/replay\`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetUrl, recalculateHmac, secret })
        });
        const result = await res.json();
        box.style.display = 'block';
        if (result.status_code >= 200 && result.status_code < 300) {
          box.style.background = 'rgba(16, 185, 129, 0.15)';
          box.style.border = '1px solid var(--success)';
          box.style.color = 'var(--success)';
          box.innerHTML = \`✔ Sucesso: HTTP \${result.status_code} (\${result.duration_ms}ms)\`;
        } else {
          box.style.background = 'rgba(239, 68, 68, 0.15)';
          box.style.border = '1px solid var(--error)';
          box.style.color = 'var(--error)';
          box.innerHTML = \`✖ Retorno HTTP \${result.status_code} (\${result.duration_ms}ms)<br><pre style="margin-top:6px; font-size:0.75rem;">\${escapeHtml(result.response_body)}</pre>\`;
        }
        fetchReplaysForWebhook(selectedWebhook.id);
        fetchStats();
      } catch (err) {
        box.style.display = 'block';
        box.style.background = 'rgba(239, 68, 68, 0.15)';
        box.style.color = 'var(--error)';
        box.innerText = 'Erro ao conectar: ' + err.message;
      } finally {
        btn.disabled = false;
        btn.innerText = 'Disparar Replay';
      }
    }

    function copyAsCurl() {
      if (!selectedWebhook) return;
      let curl = \`curl -X \${selectedWebhook.method} "\${location.origin}\${selectedWebhook.url}"\`;
      for (const [k, v] of Object.entries(selectedWebhook.headers || {})) {
        if (!['host', 'content-length'].includes(k.toLowerCase())) {
          curl += \` \\\n  -H "\${k}: \${v}"\`;
        }
      }
      if (selectedWebhook.raw_body) {
        curl += \` \\\n  -d '\${selectedWebhook.raw_body.replace(/'/g, "'\\\\''")}'\`;
      }
      navigator.clipboard.writeText(curl);
      alert('Comando cURL copiado para a área de transferência!');
    }

    function copyRawBody() {
      if (!selectedWebhook) return;
      navigator.clipboard.writeText(selectedWebhook.raw_body);
      alert('Payload copiado!');
    }

    async function clearAll() {
      if (!confirm('Deseja realmente limpar todo o histórico local de webhooks?')) return;
      await fetch('/api/webhooks', { method: 'DELETE' });
      selectedWebhook = null;
      document.getElementById('emptyState').style.display = 'block';
      document.getElementById('detailView').style.display = 'none';
      fetchWebhooks();
    }

    function formatTime(isoStr) {
      if (!isoStr) return '';
      const d = new Date(isoStr);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }

    function escapeHtml(str) {
      return (str || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
    }

    // Inicialização e Polling a cada 2.5 segundos
    fetchWebhooks();
    setInterval(fetchWebhooks, 2500);
  </script>
</body>
</html>`;
}
