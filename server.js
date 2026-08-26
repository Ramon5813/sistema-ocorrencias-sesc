require('dotenv').config();

const path = require('node:path');
const express = require('express');
const cors = require('cors');
const db = require('./database');
const occurrenceRoutes = require('./routes/occurrences');
const userRoutes = require('./routes/users');
const authRoutes = require('./routes/auth');

const app = express();
const port = Number(process.env.PORT) || 3000;

app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (_request, response) => {
  db.get('SELECT 1 AS ok', (error) => {
    if (error) {
      return response.status(503).json({ status: 'error', message: 'Banco de dados indisponivel' });
    }
    return response.json({ status: 'ok', service: 'sesc-ocorrencias' });
  });
});

app.use('/api/occurrences', occurrenceRoutes);
app.use('/api/users', userRoutes);
app.use('/api/auth', authRoutes);

app.use((error, _request, response, _next) => {
  console.error(error);
  response.status(500).json({ error: 'Erro interno do servidor' });
});

app.listen(port, () => {
  console.log(`Servidor Sesc Ocorrencias rodando em http://localhost:${port}`);
});

module.exports = app;
