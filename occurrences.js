const express = require('express');
const db = require('../database');

const router = express.Router();

router.get('/', (request, response) => {
  const userId = Number(request.get('X-User-Id'));
  if (!userId) return response.status(401).json({ error: 'Autenticacao obrigatoria' });
  db.get('SELECT profile FROM users WHERE id = ? AND active = 1', [userId], (userError, user) => {
    if (userError) return response.status(500).json({ error: userError.message });
    if (!user) return response.status(401).json({ error: 'Usuario invalido ou inativo' });
    const visibility = user.profile === 'Membro'
      ? 'WHERE occurrences.reported_by = ?'
      : ['Supervisor', 'Coordenador'].includes(user.profile)
        ? "WHERE occurrences.confidentiality NOT IN ('confidencial', 'restrito')"
        : '';
    const parameters = user.profile === 'Membro' ? [userId] : [];
  const query = `
    SELECT occurrences.*, occurrence_types.name AS occurrence_type,
           locations.name AS location, users.name AS reported_by_name
    FROM occurrences
    JOIN occurrence_types ON occurrence_types.id = occurrences.occurrence_type_id
    JOIN locations ON locations.id = occurrences.location_id
    JOIN users ON users.id = occurrences.reported_by
    ${visibility}
    ORDER BY occurrences.created_at DESC
  `;
  db.all(query, parameters, (error, rows) => {
    if (error) return response.status(500).json({ error: error.message });
    return response.json(rows);
  });
  });
});

router.get('/catalogs', (_request, response) => {
  const catalogs = {};
  db.serialize(() => {
    db.all('SELECT id, name, description FROM locations WHERE active = 1 ORDER BY name', (locationError, locations) => {
      if (locationError) return response.status(500).json({ error: locationError.message });
      catalogs.locations = locations;
      db.all('SELECT id, name, description FROM occurrence_types WHERE active = 1 ORDER BY name', (typeError, types) => {
        if (typeError) return response.status(500).json({ error: typeError.message });
        catalogs.occurrenceTypes = types;
        return response.json(catalogs);
      });
    });
  });
});

router.get('/:id', (request, response) => {
  const userId = Number(request.get('X-User-Id'));
  if (!userId) return response.status(401).json({ error: 'Autenticacao obrigatoria' });
  const query = `
    SELECT occurrences.*, medical_incidents.hda, medical_incidents.physical_exam,
      medical_incidents.medical_conduct, medical_incidents.outcome,
      occurrence_types.name AS occurrence_type,
           locations.name AS location, users.name AS reported_by_name
    FROM occurrences
    LEFT JOIN medical_incidents ON medical_incidents.occurrence_id = occurrences.id
    JOIN occurrence_types ON occurrence_types.id = occurrences.occurrence_type_id
    JOIN locations ON locations.id = occurrences.location_id
    JOIN users ON users.id = occurrences.reported_by
    WHERE occurrences.id = ?
  `;
  db.get('SELECT profile FROM users WHERE id = ? AND active = 1', [userId], (userError, user) => {
    if (userError) return response.status(500).json({ error: userError.message });
    if (!user) return response.status(401).json({ error: 'Usuario invalido ou inativo' });
    db.get(query, [request.params.id], (error, occurrence) => {
    if (error) return response.status(500).json({ error: error.message });
    if (!occurrence) return response.status(404).json({ error: 'Ocorrencia nao encontrada' });
    if (user.profile === 'Membro' && occurrence.reported_by !== userId) return response.status(403).json({ error: 'Membro pode consultar apenas suas ocorrencias' });
    if (['Supervisor', 'Coordenador'].includes(user.profile) && ['confidencial', 'restrito'].includes(occurrence.confidentiality)) return response.status(403).json({ error: 'Ocorrencia confidencial indisponivel para este perfil' });
    db.all('SELECT * FROM occurrence_audit WHERE occurrence_id = ? ORDER BY created_at DESC', [request.params.id], (auditError, audit) => {
      if (auditError) return response.status(500).json({ error: auditError.message });
      return response.json({ ...occurrence, audit });
    });
    });
  });
});

router.post('/', (request, response) => {
  const {
    occurrenceTypeId, locationId, reportedBy, occurredAt, status = 'rascunho',
    confidentiality = 'interno', description, frequentador, acompanhante,
    sescGuidance, referredToManagement = false, medicalIncident
  } = request.body;
  if (!occurrenceTypeId || !locationId || !reportedBy || !occurredAt || !description) {
    return response.status(400).json({ error: 'Tipo, local, responsavel, data e descricao sao obrigatorios' });
  }
  const authenticatedUserId = Number(request.get('X-User-Id'));
  if (!authenticatedUserId || authenticatedUserId !== Number(reportedBy)) return response.status(403).json({ error: 'O usuario autenticado deve ser o responsavel pelo registro' });

  const protocol = `SES-${Date.now()}`;
  const query = `
    INSERT INTO occurrences (
      protocol, occurrence_type_id, location_id, reported_by, occurred_at, status,
      confidentiality, frequentador_name, frequentador_document, frequentador_birth_date,
      frequentador_phone, frequentador_email, frequentador_address, frequentador_credential_type,
      frequentador_credential_number,
      companion_name, companion_relationship, description, sesc_guidance, referred_to_management
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  const frequentadorData = frequentador || {};
  const acompanhanteData = acompanhante || {};
  const values = [
    protocol, occurrenceTypeId, locationId, reportedBy, occurredAt, status, confidentiality,
    frequentadorData.name, frequentadorData.document, frequentadorData.birthDate,
    frequentadorData.phone, frequentadorData.email, frequentadorData.address, frequentadorData.credentialType,
    frequentadorData.credentialNumber,
    acompanhanteData.name, acompanhanteData.relationship, description, sescGuidance, referredToManagement ? 1 : 0
  ];
  db.run(query, values, function (error) {
    if (error) return response.status(400).json({ error: error.message });
    db.run(
      'INSERT INTO occurrence_audit (occurrence_id, user_id, action, new_status, details) VALUES (?, ?, ?, ?, ?)',
      [this.lastID, reportedBy, 'criacao', status, 'Ocorrencia criada'],
      (auditError) => {
        if (auditError) return response.status(500).json({ error: auditError.message });
        if (!medicalIncident) return response.status(201).json({ id: this.lastID, protocol, status });
        const incidentQuery = `INSERT INTO medical_incidents
          (occurrence_id, responsible_professional, professional_registration, chief_complaint,
           hda, physical_exam, medical_conduct, outcome, referral_location, incident_started_at, incident_finished_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        const incidentValues = [this.lastID, medicalIncident.professional, medicalIncident.registration,
          medicalIncident.complaint, medicalIncident.hda, medicalIncident.physicalExam,
          medicalIncident.conduct, medicalIncident.outcome, medicalIncident.referralLocation,
          medicalIncident.startedAt, medicalIncident.finishedAt];
        db.run(incidentQuery, incidentValues, (incidentError) => {
          if (incidentError) return response.status(400).json({ error: incidentError.message });
          return response.status(201).json({ id: this.lastID, protocol, status });
        });
      }
    );
  });
});

router.patch('/:id/decision', (request, response) => {
  const { action, userId, details = '', reviewerComment = '', measuresTaken = '' } = request.body;
  const decisions = { approve: 'aprovada', reject: 'reprovada', request_correction: 'em_analise' };
  if (!decisions[action] || !userId) return response.status(400).json({ error: 'Acao e usuario sao obrigatorios' });
  const nextStatus = decisions[action];
  db.get('SELECT status FROM occurrences WHERE id = ?', [request.params.id], (findError, occurrence) => {
    if (findError) return response.status(500).json({ error: findError.message });
    if (!occurrence) return response.status(404).json({ error: 'Ocorrencia nao encontrada' });
    db.get('SELECT profile FROM users WHERE id = ? AND active = 1', [userId], (userError, user) => {
      if (userError) return response.status(500).json({ error: userError.message });
      if (!user || !['Supervisor', 'Coordenador', 'Gerente', 'NTI'].includes(user.profile)) {
        return response.status(403).json({ error: 'Perfil sem permissao para decidir ocorrencias' });
      }
      if (['Supervisor', 'Coordenador'].includes(user.profile)) {
        db.get('SELECT confidentiality FROM occurrences WHERE id = ?', [request.params.id], (visibilityError, visibleOccurrence) => {
          if (visibilityError) return response.status(500).json({ error: visibilityError.message });
          if (['confidencial', 'restrito'].includes(visibleOccurrence.confidentiality)) return response.status(403).json({ error: 'Apenas Gerente ou NTI pode decidir ocorrencias confidenciais' });
          return updateDecision();
        });
      } else {
        return updateDecision();
      }
      function updateDecision() {
      db.run('UPDATE occurrences SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [nextStatus, request.params.id], (updateError) => {
        if (updateError) return response.status(500).json({ error: updateError.message });
        db.run(
          'UPDATE occurrences SET reviewer_comment = ?, measures_taken = ? WHERE id = ?',
          [reviewerComment, measuresTaken, request.params.id],
          (reviewError) => {
            if (reviewError) return response.status(500).json({ error: reviewError.message });
            db.run(
          'INSERT INTO occurrence_audit (occurrence_id, user_id, action, previous_status, new_status, details) VALUES (?, ?, ?, ?, ?, ?)',
          [request.params.id, userId, action, occurrence.status, nextStatus, details || reviewerComment || measuresTaken],
          (auditError) => {
            if (auditError) return response.status(500).json({ error: auditError.message });
            return response.json({ id: Number(request.params.id), status: nextStatus });
          }
        );
          }
        );
      });
      }
    });
  });
});

module.exports = router;
