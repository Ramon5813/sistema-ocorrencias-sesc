const express = require('express');
const db = require('../database');

const router = express.Router();

router.get('/', (_request, response) => {
  db.all('SELECT id, name, description, active FROM locations WHERE active = 1 ORDER BY name COLLATE NOCASE', (error, locations) => {
    if (error) return response.status(500).json({ error: error.message });
    return response.json(locations);
  });
});

function requireNti(request, response, next) {
  const userId = Number(request.get('X-User-Id'));
  if (!userId) return response.status(401).json({ error: 'Identificacao do usuario NTI obrigatoria' });
  db.get('SELECT profile FROM users WHERE id = ? AND active = 1', [userId], (error, user) => {
    if (error) return response.status(500).json({ error: error.message });
    if (!user || user.profile !== 'NTI') return response.status(403).json({ error: 'Apenas usuarios NTI podem gerenciar locais' });
    return next();
  });
}

router.post('/', requireNti, (request, response) => {
  const name = String(request.body.name || '').trim();
  if (!name) return response.status(400).json({ error: 'O nome do local e obrigatorio' });
  db.run('INSERT INTO locations (name) VALUES (?)', [name], function (error) {
    if (error) return response.status(400).json({ error: error.message });
    return response.status(201).json({ id: this.lastID, name, active: 1 });
  });
});

router.put('/:id', requireNti, (request, response) => {
  const name = String(request.body.name || '').trim();
  if (!name) return response.status(400).json({ error: 'O nome do local e obrigatorio' });
  db.run('UPDATE locations SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND active = 1', [name, request.params.id], function (error) {
    if (error) return response.status(400).json({ error: error.message });
    if (!this.changes) return response.status(404).json({ error: 'Local nao encontrado' });
    return response.json({ id: Number(request.params.id), name, active: 1 });
  });
});

module.exports = router;
