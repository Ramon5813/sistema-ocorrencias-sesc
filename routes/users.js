const express = require('express');
const db = require('../database');

const router = express.Router();

router.get('/', (_request, response) => {
  db.all('SELECT id, name, email, profile, active, created_at FROM users ORDER BY active DESC, profile, name', (error, users) => {
    if (error) return response.status(500).json({ error: error.message });
    return response.json(users);
  });
});

function requireNti(request, response, next) {
  const userId = Number(request.get('X-User-Id'));
  if (!userId) return response.status(401).json({ error: 'Identificacao do usuario NTI obrigatoria' });
  db.get('SELECT profile FROM users WHERE id = ? AND active = 1', [userId], (error, user) => {
    if (error) return response.status(500).json({ error: error.message });
    if (!user || user.profile !== 'NTI') return response.status(403).json({ error: 'Apenas usuarios NTI podem gerenciar usuarios' });
    return next();
  });
}

router.post('/', requireNti, (request, response) => {
  const { name, email, profile, password } = request.body;
  const profiles = ['Membro', 'Supervisor', 'Coordenador', 'Gerente', 'NTI'];
  if (!name || !email || !profiles.includes(profile) || !/^\d{4}$/.test(password || '')) {
    return response.status(400).json({ error: 'Nome, e-mail, perfil e senha numerica de 4 digitos sao obrigatorios' });
  }
  db.run('INSERT INTO users (name, email, profile, password) VALUES (?, ?, ?, ?)', [name.trim(), email.trim().toLowerCase(), profile, password], function (error) {
    if (error) return response.status(400).json({ error: error.message });
    return response.status(201).json({ id: this.lastID, name, email: email.toLowerCase(), profile, active: 1 });
  });
});

router.patch('/:id', requireNti, (request, response) => {
  const { name, email, profile, password, active = 1 } = request.body;
  const profiles = ['Membro', 'Supervisor', 'Coordenador', 'Gerente', 'NTI'];
  if (!name || !email || !profiles.includes(profile)) {
    return response.status(400).json({ error: 'Nome, e-mail e perfil valido sao obrigatorios' });
  }
  if (password !== undefined && !/^\d{4}$/.test(password)) {
    return response.status(400).json({ error: 'A senha deve ter exatamente 4 digitos numericos' });
  }
  const passwordClause = password === undefined ? '' : ', password = ?';
  const values = password === undefined
    ? [name.trim(), email.trim().toLowerCase(), profile, active ? 1 : 0, request.params.id]
    : [name.trim(), email.trim().toLowerCase(), profile, active ? 1 : 0, password, request.params.id];
  db.run(
    `UPDATE users SET name = ?, email = ?, profile = ?, active = ?${passwordClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    values,
    function (error) {
      if (error) return response.status(400).json({ error: error.message });
      if (!this.changes) return response.status(404).json({ error: 'Usuario nao encontrado' });
      return response.json({ id: Number(request.params.id), name, email: email.toLowerCase(), profile, active: active ? 1 : 0 });
    }
  );
});

router.delete('/:id', requireNti, (request, response) => {
  db.run('UPDATE users SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [request.params.id], function (error) {
    if (error) return response.status(500).json({ error: error.message });
    if (!this.changes) return response.status(404).json({ error: 'Usuario nao encontrado' });
    return response.json({ id: Number(request.params.id), active: 0 });
  });
});

module.exports = router;
