const express = require('express');
const db = require('../database');

const router = express.Router();

router.post('/login', (request, response) => {
  const { userId, password } = request.body;
  if (!userId || !/^\d{4}$/.test(password || '')) {
    return response.status(400).json({ error: 'Usuario e senha numerica de 4 digitos sao obrigatorios' });
  }
  db.get(
    'SELECT id, name, email, profile, active FROM users WHERE id = ? AND password = ? AND active = 1',
    [userId, password],
    (error, user) => {
      if (error) return response.status(500).json({ error: error.message });
      if (!user) return response.status(401).json({ error: 'Usuario ou senha invalidos' });
      return response.json(user);
    }
  );
});

router.patch('/password', (request, response) => {
  const userId = Number(request.get('X-User-Id'));
  const { currentPassword, newPassword } = request.body;
  if (!userId || !/^\d{4}$/.test(currentPassword || '') || !/^\d{4}$/.test(newPassword || '')) {
    return response.status(400).json({ error: 'Informe a senha atual e a nova senha com 4 digitos' });
  }
  db.run(
    'UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND password = ? AND active = 1',
    [newPassword, userId, currentPassword],
    function (error) {
      if (error) return response.status(500).json({ error: error.message });
      if (!this.changes) return response.status(401).json({ error: 'Senha atual incorreta' });
      return response.json({ message: 'Senha alterada com sucesso' });
    }
  );
});

module.exports = router;
