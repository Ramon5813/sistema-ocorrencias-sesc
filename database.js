const fs = require('node:fs');
const path = require('node:path');
const sqlite3 = require('sqlite3').verbose();

const databaseFile = process.env.DATABASE_FILE || './data/sesc-ocorrencias.sqlite';
const resolvedDatabaseFile = path.resolve(databaseFile);
fs.mkdirSync(path.dirname(resolvedDatabaseFile), { recursive: true });

const db = new sqlite3.Database(resolvedDatabaseFile);

db.serialize(() => {
  db.run('PRAGMA foreign_keys = ON');
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL DEFAULT '1234' CHECK (length(password) = 4 AND password GLOB '[0-9][0-9][0-9][0-9]'),
      password_hash TEXT,
      profile TEXT NOT NULL CHECK (profile IN ('Membro', 'Supervisor', 'Coordenador', 'Gerente', 'NTI')),
      active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS locations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS occurrence_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS occurrences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      protocol TEXT NOT NULL UNIQUE,
      occurrence_type_id INTEGER NOT NULL,
      location_id INTEGER NOT NULL,
      reported_by INTEGER NOT NULL,
      occurred_at TEXT NOT NULL,
      reported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      status TEXT NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'em_analise', 'aprovada', 'reprovada', 'finalizada')),
      confidentiality TEXT NOT NULL DEFAULT 'interno' CHECK (confidentiality IN ('publico', 'interno', 'confidencial', 'restrito')),
      frequentador_name TEXT,
      frequentador_document TEXT,
      frequentador_birth_date TEXT,
      frequentador_phone TEXT,
      frequentador_email TEXT,
      frequentador_address TEXT,
      frequentador_credential_type TEXT,
      frequentador_credential_number TEXT,
      companion_name TEXT,
      companion_relationship TEXT,
      description TEXT NOT NULL,
      sesc_guidance TEXT,
      referred_to_management INTEGER NOT NULL DEFAULT 0 CHECK (referred_to_management IN (0, 1)),
      reviewer_comment TEXT,
      measures_taken TEXT,
      attachments_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (occurrence_type_id) REFERENCES occurrence_types (id),
      FOREIGN KEY (location_id) REFERENCES locations (id),
      FOREIGN KEY (reported_by) REFERENCES users (id)
    )
  `);
  db.run('ALTER TABLE occurrences ADD COLUMN frequentador_credential_type TEXT', () => {});
  db.run('ALTER TABLE occurrences ADD COLUMN frequentador_credential_number TEXT', () => {});
  db.run('ALTER TABLE occurrences ADD COLUMN sesc_guidance TEXT', () => {});
  db.run('ALTER TABLE occurrences ADD COLUMN referred_to_management INTEGER NOT NULL DEFAULT 0', () => {});
  db.run('ALTER TABLE occurrences ADD COLUMN reviewer_comment TEXT', () => {});
  db.run('ALTER TABLE occurrences ADD COLUMN measures_taken TEXT', () => {});
  db.run("ALTER TABLE users ADD COLUMN password TEXT NOT NULL DEFAULT '1234'", () => {});
  db.run(`
    CREATE TABLE IF NOT EXISTS medical_incidents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      occurrence_id INTEGER NOT NULL UNIQUE,
      responsible_professional TEXT,
      professional_registration TEXT,
      chief_complaint TEXT,
      hda TEXT,
      physical_exam TEXT,
      medical_conduct TEXT,
      outcome TEXT,
      referral_location TEXT,
      incident_started_at TEXT,
      incident_finished_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (occurrence_id) REFERENCES occurrences (id) ON DELETE CASCADE
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS occurrence_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      occurrence_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      previous_status TEXT,
      new_status TEXT,
      details TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (occurrence_id) REFERENCES occurrences (id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users (id)
    )
  `);

  seedDatabase();
});

function seedDatabase() {
  const users = [
    ['Maria Membro', 'membro@sesc.local', 'Membro', '1234'],
    ['Joao Supervisor', 'supervisor@sesc.local', 'Supervisor', '2345'],
    ['Ana Coordenadora', 'coordenadora@sesc.local', 'Coordenador', '3456'],
    ['Carlos Gerente', 'gerente@sesc.local', 'Gerente', '4567'],
    ['Equipe NTI', 'nti@sesc.local', 'NTI', '5813']
  ];
  const locations = [
    ['Recepcao', 'Entrada principal da unidade'],
    ['Quadra Poliesportiva', 'Espaco esportivo'],
    ['Piscina', 'Area aquatico-esportiva'],
    ['Restaurante', 'Area de alimentacao'],
    ['Estacionamento', 'Estacionamento da unidade']
  ];
  const occurrenceTypes = [
    ['Furto', 'Subtracao de bem sem violencia'],
    ['Vandalismo', 'Dano intencional ao patrimonio'],
    ['Agressao', 'Agressao fisica ou verbal'],
    ['Perda de objeto', 'Objeto perdido nas dependencias'],
    ['Acidente', 'Acidente sem atendimento medico'],
    ['Outros', 'Ocorrencia nao classificada']
  ];

  const userStatement = db.prepare('INSERT OR IGNORE INTO users (name, email, profile, password) VALUES (?, ?, ?, ?)');
  users.forEach((user) => userStatement.run(user));
  userStatement.finalize();
  db.run("UPDATE users SET password = '5813' WHERE email = 'nti@sesc.local'");
  db.run("UPDATE users SET password = '1234' WHERE password IS NULL OR password = ''");

  const locationStatement = db.prepare('INSERT OR IGNORE INTO locations (name, description) VALUES (?, ?)');
  locations.forEach((location) => locationStatement.run(location));
  locationStatement.finalize();

  const typeStatement = db.prepare('INSERT OR IGNORE INTO occurrence_types (name, description) VALUES (?, ?)');
  occurrenceTypes.forEach((type) => typeStatement.run(type));
  typeStatement.finalize();
}

module.exports = db;
