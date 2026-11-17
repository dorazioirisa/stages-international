/* ============================================================
   Application — Stages International (Informatique / Numérique)
   ============================================================ */

let DB = null;
let currentUser = null;
let currentView = 'login';

/* ---------- Utilitaires d'affichage ---------- */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function statusBadge(status) {
  return '<span class="status st-' + esc(status) + '">' + esc(STATUS_LABELS[status] || status) + '</span>';
}

function gratificationText(g) {
  if (g === '' || g == null) return 'Non précisée';
  if (Number(g) === 0) return 'Non rémunérée';
  return Number(g).toLocaleString('fr-FR') + ' €/mois';
}

function isDeadlinePassed(subject) {
  return subject.deadline && subject.deadline < todayISO();
}

function needsAdminRelance(app) {
  if (app.status !== 'mise_en_relation' && app.status !== 'complements') return false;
  return app.lastPartnerActivity && daysSince(app.lastPartnerActivity) > 7;
}

function visibleSubjects(student) {
  return DB.subjects.filter(s => {
    if (s.status !== 'open') return false;
    return s.profil === 'both' || s.profil === student.diplome.toLowerCase();
  });
}

/* ---------- Session ---------- */
function saveSession() {
  if (currentUser) localStorage.setItem(SESSION_KEY, currentUser.id);
  else localStorage.removeItem(SESSION_KEY);
}

function restoreSession() {
  const id = localStorage.getItem(SESSION_KEY);
  if (!id) return null;
  const u = getUser(id);
  return u && u.status === 'active' ? u : null;
}

/* ---------- Authentification ---------- */
async function doLogin(ev) {
  ev.preventDefault();
  const email = document.getElementById('login-email').value.trim().toLowerCase();
  const pass = document.getElementById('login-pass').value;
  const hash = await sha256(pass);
  const user = DB.users.find(u => u.email.toLowerCase() === email);
  const err = document.getElementById('login-error');
  if (!user || user.pass !== hash) {
    err.textContent = 'Email ou mot de passe incorrect.';
    err.style.display = '';
    return;
  }
  if (user.status === 'pending') {
    err.textContent = "Votre compte est en attente de validation par l'administrateur.";
    err.style.display = '';
    return;
  }
  if (user.status === 'refused') {
    err.textContent = "Votre compte a été refusé par l'administrateur.";
    err.style.display = '';
    return;
  }
  err.style.display = 'none';
  currentUser = user;
  saveSession();
  go(homeView());
}

function logout() {
  currentUser = null;
  saveSession();
  go('login');
}

async function doRegister(ev) {
  ev.preventDefault();
  const err = document.getElementById('reg-error');
  err.textContent = '';
  const role = document.getElementById('reg-role').value;

  const email = document.getElementById('reg-email').value.trim().toLowerCase();
  const pass = document.getElementById('reg-pass').value;
  const pass2 = document.getElementById('reg-pass2').value;

  if (pass.length < 6) { err.textContent = 'Le mot de passe doit contenir au moins 6 caractères.'; return; }
  if (pass !== pass2) { err.textContent = 'Les deux mots de passe ne correspondent pas.'; return; }
  if (DB.users.some(u => u.email.toLowerCase() === email)) {
    err.textContent = 'Un compte existe déjà avec cet email.'; return;
  }

  const user = {
    id: uid('u'), role, email,
    pass: await sha256(pass),
    status: 'pending',
    createdAt: new Date().toISOString()
  };

  if (role === 'etudiant') {
    user.nom = document.getElementById('reg-nom').value.trim();
    user.prenom = document.getElementById('reg-prenom').value.trim();
    user.composante = document.getElementById('reg-composante').value.trim();
    user.diplome = document.getElementById('reg-diplome').value;
    user.niveau = document.getElementById('reg-niveau').value;
    user.dateDebut = document.getElementById('reg-debut').value;
    user.dateFin = document.getElementById('reg-fin').value;
    user.flexible = document.getElementById('reg-flexible').checked;
    if (!user.nom || !user.prenom || !user.composante || !user.diplome || !user.niveau || !user.dateDebut) {
      err.textContent = 'Merci de remplir tous les champs obligatoires.'; return;
    }
  } else {
    user.organisation = document.getElementById('reg-organisation').value.trim();
    user.pays = document.getElementById('reg-pays-org').value;
    if (!user.organisation) { err.textContent = "Merci d'indiquer le nom de l'entreprise/université."; return; }
  }

  DB.users.push(user);
  saveDB();
  document.getElementById('reg-form').reset();
  toggleRegisterFields();
  err.innerHTML = '<span style="color:var(--vert)">Compte créé ! Il est désormais en attente de validation par l\'administrateur.</span>';
}

function toggleRegisterFields() {
  const role = document.getElementById('reg-role').value;
  document.getElementById('reg-fields-etudiant').style.display = role === 'etudiant' ? '' : 'none';
  document.getElementById('reg-fields-partenaire').style.display = role === 'partenaire' ? '' : 'none';
}

/* ---------- Navigation ---------- */
function go(view) {
  currentView = view;
  render();
  window.scrollTo(0, 0);
}

function renderNav() {
  const bar = document.getElementById('topbar');
  if (!currentUser) {
    bar.innerHTML = '<div class="topbar-inner"><div class="logo">Stages International' +
      '<small>Informatique &amp; Numérique</small></div></div>';
    return;
  }
  const links = [];
  const notif = (n) => n > 0 ? '<span class="badge-notif">' + n + '</span>' : '';

  if (currentUser.role === 'etudiant') {
    const toAct = DB.applications.filter(a => a.studentId === currentUser.id &&
      ['conditions', 'mise_en_relation'].includes(a.status)).length;
    links.push(['etu-sujets', 'Sujets de stage', 0]);
    links.push(['etu-candidatures', 'Mes candidatures', toAct]);
  } else if (currentUser.role === 'partenaire') {
    const newApps = DB.applications.filter(a => {
      const s = getSubject(a.subjectId);
      return s && s.partnerId === currentUser.id && a.status === 'soumise';
    }).length;
    links.push(['par-sujets', 'Mes sujets de stage', 0]);
    links.push(['par-candidatures', 'Candidatures reçues', newApps]);
  } else {
    const pending = DB.users.filter(u => u.status === 'pending').length;
    const toDo = DB.applications.filter(a => a.status === 'reteneue' || a.status === 'conditions_acceptees').length;
    links.push(['admin-comptes', 'Comptes', pending]);
    links.push(['admin-candidatures', 'Candidatures', toDo]);
    links.push(['admin-analyse', 'Analyse des données', 0]);
    links.push(['admin-conditions', 'Conditions générales', 0]);
  }

  bar.innerHTML = '<div class="topbar-inner">' +
    '<div class="logo" onclick="go(\'' + homeView() + '\')">Stages International' +
    '<small>Informatique &amp; Numérique</small></div>' +
    '<nav class="nav-links">' +
    links.map(l => '<button class="' + (currentView === l[0] ? 'active' : '') + '" onclick="go(\'' + l[0] + '\')">' +
      esc(l[1]) + notif(l[2]) + '</button>').join('') +
    '</nav>' +
    '<div class="nav-right"><div class="nav-user">' + esc(currentUser.role === 'etudiant' ?
      currentUser.prenom + ' ' + currentUser.nom : (currentUser.organisation || currentUser.email)) +
    '<span class="role">' + esc(ROLE_LABELS[currentUser.role]) + '</span></div>' +
    '<button class="btn-logout" onclick="logout()">Déconnexion</button></div></div>';
}

function homeView() {
  if (!currentUser) return 'login';
  return currentUser.role === 'admin' ? 'admin-comptes' :
    currentUser.role === 'etudiant' ? 'etu-sujets' : 'par-sujets';
}

function render() {
  renderNav();
  const app = document.getElementById('app');
  const activeId = document.activeElement ? document.activeElement.id : '';
  if (!currentUser) { app.innerHTML = authView(); return; }
  switch (currentView) {
    case 'etu-sujets': app.innerHTML = etuSujetsView(); break;
    case 'etu-candidatures': app.innerHTML = etuCandidaturesView(); break;
    case 'par-sujets': app.innerHTML = parSujetsView(); break;
    case 'par-candidatures': app.innerHTML = parCandidaturesView(); break;
    case 'admin-comptes': app.innerHTML = adminComptesView(); break;
    case 'admin-candidatures': app.innerHTML = adminCandidaturesView(); break;
    case 'admin-analyse': app.innerHTML = adminAnalyseView(); break;
    case 'admin-conditions': app.innerHTML = adminConditionsView(); break;
    default: app.innerHTML = authView();
  }
  if (activeId) {
    const el = document.getElementById(activeId);
    if (el && el.type !== 'file') {
      el.focus();
      try { el.setSelectionRange(el.value.length, el.value.length); } catch (e) { /* non applicable */ }
    }
  }
}

/* ============================================================
   Vues authentification
   ============================================================ */
function authView() {
  return '<div class="auth-wrap">' +
    '<h1>Stages International</h1>' +
    '<p class="subtitle">Plateforme de gestion des stages à l\'étranger — thématique Informatique &amp; Numérique</p>' +
    '<div class="card">' +
    '<form onsubmit="doLogin(event)">' +
    '<div class="form-group"><label>Email</label>' +
    '<input type="email" id="login-email" required></div>' +
    '<div class="form-group"><label>Mot de passe</label>' +
    '<input type="password" id="login-pass" required></div>' +
    '<div id="login-error" class="alert error" style="display:none" onclick="this.style.display=\'none\'"></div>' +
    '<button class="btn" type="submit" style="width:100%">Se connecter</button>' +
    '</form>' +
    '<p style="text-align:center;margin-top:14px;font-size:.88rem">' +
    'Pas encore de compte ? <a href="#" onclick="showRegister();return false">S\'inscrire</a></p>' +
    '</div>' +
    '<div class="demo-box"><strong>Comptes de démonstration</strong><br>' +
    'Admin : <code>admin@stages.fr</code> / <code>admin123</code><br>' +
    'Partenaire : <code>contact@techcorp.de</code> / <code>partner123</code><br>' +
    'Étudiant : <code>lea.dupont@iut-grenoble.fr</code> / <code>etu123</code></div>' +
    '</div>';
}

function showRegister() {
  const app = document.getElementById('app');
  app.innerHTML = '<div class="auth-wrap">' +
    '<h1>Inscription</h1>' +
    '<p class="subtitle">Votre compte sera validé par l\'administrateur avant activation.</p>' +
    '<div class="card"><form id="reg-form" onsubmit="doRegister(event)">' +
    '<div class="form-group"><label>Je suis…</label>' +
    '<select id="reg-role" onchange="toggleRegisterFields()">' +
    '<option value="etudiant">Étudiant</option>' +
    '<option value="partenaire">Entreprise / Université (partenaire)</option>' +
    '</select></div>' +
    '<div id="reg-fields-etudiant">' +
    '<div class="form-row">' +
    '<div class="form-group"><label>Nom <span class="req">*</span></label><input id="reg-nom" required></div>' +
    '<div class="form-group"><label>Prénom <span class="req">*</span></label><input id="reg-prenom" required></div>' +
    '</div>' +
    '<div class="form-group"><label>Composante <span class="req">*</span> <span class="form-hint">ex : IUT de Grenoble, INSA Lyon</span></label><input id="reg-composante" required></div>' +
    '<div class="form-row">' +
    '<div class="form-group"><label>Diplôme préparé <span class="req">*</span></label>' +
    '<select id="reg-diplome">' + DIPLOMES.map(d => '<option>' + d + '</option>').join('') + '</select></div>' +
    '<div class="form-group"><label>Niveau <span class="req">*</span></label>' +
    '<select id="reg-niveau">' + NIVEAUX.map(n => '<option>' + n + '</option>').join('') + '</select></div>' +
    '</div>' +
    '<div class="form-row">' +
    '<div class="form-group"><label>Début de stage souhaité <span class="req">*</span></label><input type="date" id="reg-debut" required></div>' +
    '<div class="form-group"><label>Fin de stage souhaitée</label><input type="date" id="reg-fin"></div>' +
    '</div>' +
    '<div class="form-group"><label class="checkbox-line"><input type="checkbox" id="reg-flexible"> Flexible sur les dates</label></div>' +
    '</div>' +
    '<div id="reg-fields-partenaire" style="display:none">' +
    '<div class="form-group"><label>Entreprise / Université <span class="req">*</span></label><input id="reg-organisation"></div>' +
    '<div class="form-group"><label>Pays</label><select id="reg-pays-org">' +
    COUNTRIES.map(c => '<option>' + c + '</option>').join('') + '</select></div>' +
    '</div>' +
    '<div class="form-group"><label>Email <span class="req">*</span></label><input type="email" id="reg-email" required></div>' +
    '<div class="form-row">' +
    '<div class="form-group"><label>Mot de passe <span class="req">*</span></label><input type="password" id="reg-pass" required></div>' +
    '<div class="form-group"><label>Confirmation <span class="req">*</span></label><input type="password" id="reg-pass2" required></div>' +
    '</div>' +
    '<div id="reg-error" style="font-size:.88rem;margin-bottom:10px"></div>' +
    '<button class="btn" type="submit" style="width:100%">Créer mon compte</button>' +
    '</form>' +
    '<p style="text-align:center;margin-top:14px;font-size:.88rem">' +
    '<a href="#" onclick="go(\'login\');return false">Retour à la connexion</a></p>' +
    '</div></div>';
}

/* ============================================================
   Vues ÉTUDIANT
   ============================================================ */
function etuSujetsView() {
  const subjects = visibleSubjects(currentUser);
  const pays = document.getElementById('f-pays') ? document.getElementById('f-pays').value : '';
  const q = document.getElementById('f-q') ? document.getElementById('f-q').value.toLowerCase() : '';

  let list = subjects;
  if (pays) list = list.filter(s => s.pays === pays);
  if (q) list = list.filter(s =>
    (s.titre + ' ' + s.entreprise + ' ' + (s.description || '')).toLowerCase().includes(q));

  const paysOptions = [...new Set(subjects.map(s => s.pays))].sort();

  return '<h1>Sujets de stage disponibles</h1>' +
    '<p class="subtitle">Sujets correspondant à votre profil : ' + esc(currentUser.diplome) +
    ' — ' + esc(currentUser.niveau) + ' (' + esc(currentUser.composante) + ')</p>' +
    '<div class="filters">' +
    '<div class="form-group"><label>Recherche</label><input id="f-q" value="' + esc(q) + '" oninput="render()" placeholder="Titre, entreprise…"></div>' +
    '<div class="form-group"><label>Pays</label><select id="f-pays" onchange="render()">' +
    '<option value="">Tous les pays</option>' +
    paysOptions.map(p => '<option' + (p === pays ? ' selected' : '') + '>' + esc(p) + '</option>').join('') +
    '</select></div></div>' +
    (list.length === 0 ? '<div class="empty">Aucun sujet de stage ne correspond à votre profil pour le moment.</div>' :
      '<div class="grid grid-2">' + list.map(subjectCard).join('') + '</div>');
}

function subjectCard(s) {
  const passed = isDeadlinePassed(s);
  return '<div class="card"><h3>' + esc(s.titre) + '</h3>' +
    '<div class="meta">' + esc(s.entreprise) + ' · ' + esc(s.pays) +
    (s.duree ? ' · ' + esc(s.duree) : '') + '</div>' +
    '<div class="meta">' +
    '<span class="tag">' + esc(PROFILS[s.profil]) + '</span>' +
    '<span class="tag">' + esc(gratificationText(s.gratification)) + '</span>' +
    (s.deadline ? '<span class="tag">Limite : ' + fmtDate(s.deadline) + '</span>' : '') +
    '</div>' +
    (passed ? '<div class="alert" style="margin:6px 0">Date limite de candidature dépassée.</div>' : '') +
    '<div class="actions-row">' +
    '<button class="btn secondary small" onclick="openSubjectDetail(\'' + s.id + '\')">Voir le détail</button>' +
    (!passed ? '<button class="btn small" onclick="openApply(\'' + s.id + '\')">Postuler</button>' : '') +
    '</div></div>';
}

function openSubjectDetail(id) {
  const s = getSubject(id);
  if (!s) return;
  openModal('<h2>' + esc(s.titre) + '</h2>' +
    '<p class="subtitle">' + esc(s.entreprise) + ' · ' + esc(s.pays) + '</p>' +
    '<div class="detail-line"><strong>Description :</strong> ' + esc(s.description || 'Non renseignée') + '</div>' +
    '<div class="detail-line"><strong>Adresse :</strong> ' + esc(s.adresse || 'Non renseignée') + '</div>' +
    '<div class="detail-line"><strong>Profil demandé :</strong> ' + esc(PROFILS[s.profil]) + '</div>' +
    '<div class="detail-line"><strong>Pré-requis :</strong> ' + esc(s.prerequis || 'Aucun') + '</div>' +
    '<div class="detail-line"><strong>Durée :</strong> ' + esc(s.duree || 'Non précisée') + '</div>' +
    '<div class="detail-line"><strong>Gratification :</strong> ' + esc(gratificationText(s.gratification)) + '</div>' +
    '<div class="detail-line"><strong>Date limite :</strong> ' + fmtDate(s.deadline) + '</div>' +
    '<div class="detail-line"><strong>Contact :</strong> ' + esc(s.contactPrenom + ' ' + s.contactNom) +
    ' — <a href="mailto:' + esc(s.contactEmail) + '">' + esc(s.contactEmail) + '</a></div>' +
    '<div class="modal-actions">' +
    (!isDeadlinePassed(s) ? '<button class="btn" onclick="closeModal();openApply(\'' + s.id + '\')">Postuler</button>' : '') +
    '<button class="btn secondary" onclick="closeModal()">Fermer</button></div>');
}

function openApply(subjectId) {
  openModal('<h2>Postuler — ' + esc(getSubject(subjectId).titre) + '</h2>' +
    '<form onsubmit="submitApply(event, \'' + subjectId + '\')">' +
    '<div class="form-group"><label>Message de motivation <span class="req">*</span></label>' +
    '<textarea id="ap-message" required></textarea></div>' +
    '<div class="form-group"><label>CV <span class="req">*</span> <span class="form-hint">PDF ou image — 1,2 Mo max</span></label>' +
    '<input type="file" id="ap-cv" accept=".pdf,.png,.jpg,.jpeg" required></div>' +
    '<div class="form-group"><label>Courriel de l\'enseignant référent / responsable de formation <span class="req">*</span></label>' +
    '<input type="email" id="ap-referent" required></div>' +
    '<div class="form-group"><label>Bulletins de notes</label><input type="file" id="ap-bulletins" multiple accept=".pdf,.png,.jpg,.jpeg">' +
    '<div class="form-hint">Plusieurs fichiers possibles — 1,2 Mo max par fichier</div></div>' +
    '<div class="form-group"><label>Lettres de recommandation</label><input type="file" id="ap-lettres" multiple accept=".pdf,.png,.jpg,.jpeg"></div>' +
    '<div id="ap-error" style="font-size:.88rem;color:var(--rouge);margin-bottom:10px"></div>' +
    '<div class="modal-actions">' +
    '<button class="btn secondary" type="button" onclick="closeModal()">Annuler</button>' +
    '<button class="btn" type="submit">Envoyer ma candidature</button></div></form>');
}

async function submitApply(ev, subjectId) {
  ev.preventDefault();
  const err = document.getElementById('ap-error');
  try {
    const cv = (await readInputFiles(document.getElementById('ap-cv')))[0];
    const bulletins = await readInputFiles(document.getElementById('ap-bulletins'));
    const lettres = await readInputFiles(document.getElementById('ap-lettres'));
    const now = new Date().toISOString();
    DB.applications.push({
      id: uid('a'), subjectId, studentId: currentUser.id,
      message: document.getElementById('ap-message').value.trim(),
      cv, referentEmail: document.getElementById('ap-referent').value.trim(),
      bulletins, lettres,
      date: now, status: 'soumise',
      lastPartnerActivity: now,
      history: [{ date: now, label: 'Candidature soumise' }]
    });
    saveDB();
    closeModal();
    go('etu-candidatures');
  } catch (e) {
    err.textContent = e.message;
  }
}

function etuCandidaturesView() {
  const apps = DB.applications.filter(a => a.studentId === currentUser.id)
    .sort((a, b) => b.date.localeCompare(a.date));
  if (!apps.length) {
    return '<h1>Mes candidatures</h1><div class="empty">Vous n\'avez pas encore postulé. ' +
      '<a href="#" onclick="go(\'etu-sujets\');return false">Voir les sujets de stage</a></div>';
  }
  return '<h1>Mes candidatures</h1>' +
    '<p class="subtitle">Suivez l\'avancement de chaque candidature étape par étape.</p>' +
    apps.map(appCard).join('');
}

function appCard(app) {
  const s = getSubject(app.subjectId);
  const idx = STATUS_ORDER.indexOf(app.status);
  const alert = needsAdminRelance(app) ?
    '<div class="alert">⏰ Pas de réponse de l\'entreprise depuis plus de 7 jours. ' +
    'Revenez vers l\'administrateur pour le relancer.</div>' : '';
  return '<div class="card"><h3>' + esc(s.titre) + '</h3>' +
    '<div class="meta">' + esc(s.entreprise) + ' · ' + esc(s.pays) +
    ' · Candidature du ' + fmtDate(app.date) + ' &nbsp; ' + statusBadge(app.status) + '</div>' +
    '<div class="steps">' + STATUS_ORDER.map((st, i) =>
      '<span class="step' + (i < idx ? ' done' : i === idx ? ' current' : '') + '">' +
      esc(STATUS_LABELS[st]) + '</span>').join('') + '</div>' +
    (app.status === 'refusee' ? '<div class="alert error">Candidature refusée par le partenaire.</div>' : '') +
    alert +
    '<div class="attachments">' + attachmentsHtml(app) + '</div>' +
    appActions(app) +
    messagesHtml(app) +
    '</div>';
}

function attachmentsHtml(app) {
  const links = [];
  const mk = (att) => '<a href="' + att.data + '" download="' + esc(att.name) + '">📎 ' + esc(att.name) + '</a>';
  if (app.cv && app.cv.name) links.push(mk(app.cv));
  (app.bulletins || []).forEach(b => links.push(mk(b)));
  (app.lettres || []).forEach(l => links.push(mk(l)));
  return links.length ? links.join('') : '';
}

function appActions(app) {
  if (['aboutie', 'refusee'].includes(app.status)) return '';
  let html = '<div class="actions-row">';
  if (app.status === 'conditions') {
    html += '<button class="btn success small" onclick="acceptConditions(\'' + app.id + '\')">Accepter les conditions générales</button>';
  }
  if (app.status === 'mise_en_relation') {
    html += '<button class="btn small" onclick="openComplements(\'' + app.id + '\')">Envoyer des compléments</button>';
  }
  html += '</div>';
  return html;
}

function acceptConditions(appId) {
  const app = getApplication(appId);
  if (!app) return;
  app.status = 'conditions_acceptees';
  addHistory(app, "Conditions générales acceptées par l'étudiant");
  addMessage(appId, currentUser.id, "J'ai lu et j'accepte les conditions générales proposées.");
  saveDB();
  render();
}

function openComplements(appId) {
  const app = getApplication(appId);
  openModal('<h2>Compléments — ' + esc(getSubject(app.subjectId).titre) + '</h2>' +
    '<p class="subtitle">Fournissez les éléments complémentaires demandés dans le cadre de la mise en relation.</p>' +
    '<form onsubmit="submitComplements(event, \'' + appId + '\')">' +
    '<div class="form-group"><label>Message / éléments complémentaires</label>' +
    '<textarea id="cp-message" required></textarea></div>' +
    '<div class="form-group"><label>Pièces jointes (facultatif)</label>' +
    '<input type="file" id="cp-files" multiple accept=".pdf,.png,.jpg,.jpeg">' +
    '<div class="form-hint">1,2 Mo max par fichier</div></div>' +
    '<div id="cp-error" style="font-size:.88rem;color:var(--rouge);margin-bottom:10px"></div>' +
    '<div class="modal-actions">' +
    '<button class="btn secondary" type="button" onclick="closeModal()">Annuler</button>' +
    '<button class="btn" type="submit">Envoyer</button></div></form>');
}

async function submitComplements(ev, appId) {
  ev.preventDefault();
  const err = document.getElementById('cp-error');
  try {
    const files = await readInputFiles(document.getElementById('cp-files'));
    const app = getApplication(appId);
    app.complements = app.complements || [];
    app.complements.push(...files);
    app.status = 'complements';
    addHistory(app, "Compléments fournis par l'étudiant");
    addMessage(appId, currentUser.id, document.getElementById('cp-message').value.trim());
    saveDB();
    closeModal();
    render();
  } catch (e) {
    err.textContent = e.message;
  }
}

function messagesHtml(app) {
  const msgs = getMessages(app.id);
  let html = '<div class="messages"><h4>💬 Fil de discussion</h4>';
  if (msgs.length) {
    html += msgs.map(m => {
      const from = getUser(m.fromId);
      const cls = from && from.role === 'admin' ? 'from-admin' :
        from && from.role === 'partenaire' ? 'from-partner' : '';
      return '<div class="msg ' + cls + '"><div class="msg-head">' +
        esc(from ? (from.role === 'etudiant' ? from.prenom + ' ' + from.nom :
          from.organisation || from.email) : 'Utilisateur') +
        ' — ' + fmtDateTime(m.date) + '</div>' + esc(m.text) + '</div>';
    }).join('');
  } else {
    html += '<div class="form-hint" style="margin-bottom:6px">Aucun message pour le moment.</div>';
  }
  html += '<form class="msg-form" onsubmit="sendAppMessage(event, \'' + app.id + '\')">' +
    '<input type="text" placeholder="Votre message…" required>' +
    '<button class="btn small" type="submit">Envoyer</button></form></div>';
  return html;
}

function sendAppMessage(ev, appId) {
  ev.preventDefault();
  const input = ev.target.querySelector('input');
  if (!input.value.trim()) return;
  addMessage(appId, currentUser.id, input.value.trim());
  saveDB();
  render();
}

/* ============================================================
   Vues PARTENAIRE
   ============================================================ */
function parSujetsView() {
  const subjects = DB.subjects.filter(s => s.partnerId === currentUser.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return '<h1>Mes sujets de stage</h1>' +
    '<p class="subtitle">' + esc(currentUser.organisation) + '</p>' +
    '<div class="actions-row" style="margin-bottom:18px">' +
    '<button class="btn" onclick="openSubjectForm()">+ Déposer un sujet de stage</button></div>' +
    (subjects.length === 0 ? '<div class="empty">Vous n\'avez pas encore déposé de sujet de stage.</div>' :
      subjects.map(parSubjectCard).join(''));
}

function parSubjectCard(s) {
  const nb = DB.applications.filter(a => a.subjectId === s.id).length;
  return '<div class="card"><h3>' + esc(s.titre) + '</h3>' +
    '<div class="meta">' + esc(s.pays) + (s.duree ? ' · ' + esc(s.duree) : '') +
    ' · <span class="tag">' + esc(PROFILS[s.profil]) + '</span>' +
    ' <span class="status st-' + (s.status === 'open' ? 'open' : 'closed') + '">' +
    (s.status === 'open' ? 'Ouvert' : 'Clôturé') + '</span></div>' +
    '<div class="meta">' + nb + ' candidature(s) reçue(s)' +
    (s.deadline ? ' · Date limite : ' + fmtDate(s.deadline) : '') + '</div>' +
    '<div class="actions-row">' +
    '<button class="btn secondary small" onclick="openSubjectForm(\'' + s.id + '\')">Modifier</button>' +
    '<button class="btn secondary small" onclick="toggleSubject(\'' + s.id + '\')">' +
    (s.status === 'open' ? 'Clôturer' : 'Réouvrir') + '</button>' +
    '<button class="btn danger small" onclick="deleteSubject(\'' + s.id + '\')">Supprimer</button>' +
    '</div></div>';
}

function openSubjectForm(id) {
  const s = id ? getSubject(id) : null;
  const opt = (list, val) => list.map(c =>
    '<option' + (c === val ? ' selected' : '') + '>' + esc(c) + '</option>').join('');
  openModal('<h2>' + (s ? 'Modifier le sujet' : 'Déposer un sujet de stage') + '</h2>' +
    '<form onsubmit="submitSubject(event, ' + (s ? '\'' + s.id + '\'' : 'null') + ')">' +
    '<div class="form-group"><label>Titre du stage <span class="req">*</span></label>' +
    '<input id="sf-titre" value="' + esc(s ? s.titre : '') + '" required></div>' +
    '<div class="form-group"><label>Description</label>' +
    '<textarea id="sf-description">' + esc(s ? s.description : '') + '</textarea></div>' +
    '<div class="form-group"><label>Entreprise / Université <span class="req">*</span></label>' +
    '<input id="sf-entreprise" value="' + esc(s ? s.entreprise : (currentUser.organisation || '')) + '" required></div>' +
    '<div class="form-row">' +
    '<div class="form-group"><label>Pays <span class="req">*</span></label>' +
    '<select id="sf-pays"><option value="">— Choisir —</option>' + opt(COUNTRIES, s ? s.pays : '') + '</select></div>' +
    '<div class="form-group"><label>Adresse</label><input id="sf-adresse" value="' + esc(s ? s.adresse : '') + '"></div>' +
    '</div>' +
    '<div class="form-row">' +
    '<div class="form-group"><label>Nom du contact <span class="req">*</span></label><input id="sf-cnom" value="' + esc(s ? s.contactNom : '') + '" required></div>' +
    '<div class="form-group"><label>Prénom du contact <span class="req">*</span></label><input id="sf-cprenom" value="' + esc(s ? s.contactPrenom : '') + '" required></div>' +
    '</div>' +
    '<div class="form-group"><label>Courriel du contact <span class="req">*</span></label>' +
    '<input type="email" id="sf-cemail" value="' + esc(s ? s.contactEmail : '') + '" required></div>' +
    '<div class="form-row">' +
    '<div class="form-group"><label>Profil étudiant demandé</label>' +
    '<select id="sf-profil">' +
    '<option value="both"' + (s && s.profil === 'both' ? ' selected' : '') + '>Bachelor ou Master</option>' +
    '<option value="bachelor"' + (s && s.profil === 'bachelor' ? ' selected' : '') + '>Bachelor</option>' +
    '<option value="master"' + (s && s.profil === 'master' ? ' selected' : '') + '>Master</option>' +
    '</select></div>' +
    '<div class="form-group"><label>Durée</label><input id="sf-duree" value="' + esc(s ? s.duree : '') + '" placeholder="ex : 3 mois"></div>' +
    '</div>' +
    '<div class="form-row">' +
    '<div class="form-group"><label>Gratification (€/mois)</label>' +
    '<input type="number" id="sf-grat" min="0" step="50" value="' + (s && s.gratification ? s.gratification : '') + '" placeholder="0 = non rémunérée"></div>' +
    '<div class="form-group"><label>Date limite de candidature</label>' +
    '<input type="date" id="sf-deadline" value="' + esc(s ? s.deadline : '') + '"></div>' +
    '</div>' +
    '<div class="form-group"><label>Pré-requis</label>' +
    '<textarea id="sf-prerequis" style="min-height:60px">' + esc(s ? s.prerequis : '') + '</textarea></div>' +
    '<div id="sf-error" style="font-size:.88rem;color:var(--rouge);margin-bottom:10px"></div>' +
    '<div class="modal-actions">' +
    '<button class="btn secondary" type="button" onclick="closeModal()">Annuler</button>' +
    '<button class="btn" type="submit">' + (s ? 'Enregistrer' : 'Publier le sujet') + '</button></div></form>');
}

function submitSubject(ev, id) {
  ev.preventDefault();
  const err = document.getElementById('sf-error');
  const pays = document.getElementById('sf-pays').value;
  if (!pays) { err.textContent = 'Merci de sélectionner un pays.'; return; }
  const data = {
    titre: document.getElementById('sf-titre').value.trim(),
    description: document.getElementById('sf-description').value.trim(),
    entreprise: document.getElementById('sf-entreprise').value.trim(),
    pays,
    adresse: document.getElementById('sf-adresse').value.trim(),
    contactNom: document.getElementById('sf-cnom').value.trim(),
    contactPrenom: document.getElementById('sf-cprenom').value.trim(),
    contactEmail: document.getElementById('sf-cemail').value.trim(),
    profil: document.getElementById('sf-profil').value,
    duree: document.getElementById('sf-duree').value.trim(),
    gratification: document.getElementById('sf-grat').value === '' ? '' :
      Number(document.getElementById('sf-grat').value),
    deadline: document.getElementById('sf-deadline').value,
    prerequis: document.getElementById('sf-prerequis').value.trim()
  };
  if (id) {
    Object.assign(getSubject(id), data);
  } else {
    DB.subjects.push(Object.assign({
      id: uid('s'), partnerId: currentUser.id, status: 'open',
      createdAt: new Date().toISOString()
    }, data));
  }
  saveDB();
  closeModal();
  render();
}

function toggleSubject(id) {
  const s = getSubject(id);
  s.status = s.status === 'open' ? 'closed' : 'open';
  saveDB();
  render();
}

function deleteSubject(id) {
  if (!confirm('Supprimer ce sujet de stage et toutes ses candidatures ?')) return;
  DB.subjects = DB.subjects.filter(s => s.id !== id);
  const appIds = DB.applications.filter(a => a.subjectId === id).map(a => a.id);
  DB.applications = DB.applications.filter(a => a.subjectId !== id);
  DB.messages = DB.messages.filter(m => !appIds.includes(m.appId));
  saveDB();
  render();
}

function parCandidaturesView() {
  const mySubjectIds = DB.subjects.filter(s => s.partnerId === currentUser.id).map(s => s.id);
  const apps = DB.applications.filter(a => mySubjectIds.includes(a.subjectId))
    .sort((a, b) => b.date.localeCompare(a.date));
  return '<h1>Candidatures reçues</h1>' +
    '<p class="subtitle">Examinez les dossiers (CV, recommandations, notes) pour donner suite ou non.</p>' +
    (apps.length === 0 ? '<div class="empty">Aucune candidature reçue pour le moment.</div>' :
      apps.map(partnerAppCard).join(''));
}

function partnerAppCard(app) {
  const s = getSubject(app.subjectId);
  const st = getUser(app.studentId);
  const alert = needsAdminRelance(app) ?
    '<div class="alert">⏰ Sans réponse depuis plus de 7 jours — pensez à répondre à l\'étudiant.</div>' : '';
  return '<div class="card"><h3>' + esc(st.prenom + ' ' + st.nom) + '</h3>' +
    '<div class="meta">' + esc(s.titre) + ' · ' + fmtDate(app.date) + ' &nbsp; ' + statusBadge(app.status) + '</div>' +
    '<div class="meta">' +
    '<span class="tag">' + esc(st.composante) + '</span>' +
    '<span class="tag">' + esc(st.diplome) + ' — ' + esc(st.niveau) + '</span>' +
    '<span class="tag">Début : ' + fmtDate(st.dateDebut) + (st.dateFin ? ' → ' + fmtDate(st.dateFin) : '') + '</span>' +
    (st.flexible ? '<span class="tag">Dates flexibles</span>' : '') +
    '</div>' +
    '<div class="desc">💬 ' + esc(app.message) + '</div>' +
    '<div class="detail-line"><strong>Enseignant référent :</strong> ' + esc(app.referentEmail) + '</div>' +
    '<div class="attachments">' + attachmentsHtml(app) +
    (app.complements || []).map(a => '<a href="' + a.data + '" download="' + esc(a.name) + '">📎 ' + esc(a.name) + ' (complément)</a>').join('') +
    '</div>' +
    alert +
    partnerAppActions(app) +
    messagesHtml(app) +
    '</div>';
}

function partnerAppActions(app) {
  if (['aboutie', 'refusee'].includes(app.status)) return '';
  let html = '<div class="actions-row">';
  if (app.status === 'soumise') {
    html += '<button class="btn success small" onclick="setAppStatus(\'' + app.id + '\',\'reteneue\')">Retenir le dossier</button>';
  }
  if (['mise_en_relation', 'complements'].includes(app.status)) {
    html += '<button class="btn secondary small" onclick="requestComplements(\'' + app.id + '\')">Demander des compléments</button>';
    html += '<button class="btn success small" onclick="setAppStatus(\'' + app.id + '\',\'aboutie\')">Marquer comme aboutie</button>';
  }
  html += '<button class="btn danger small" onclick="setAppStatus(\'' + app.id + '\',\'refusee\')">Refuser</button>';
  html += '</div>';
  return html;
}

function setAppStatus(appId, status) {
  const app = getApplication(appId);
  if (!app) return;
  app.status = status;
  app.lastPartnerActivity = new Date().toISOString();
  addHistory(app, 'Statut mis à jour : ' + STATUS_LABELS[status]);
  saveDB();
  render();
}

function requestComplements(appId) {
  const app = getApplication(appId);
  app.status = 'mise_en_relation';
  app.lastPartnerActivity = new Date().toISOString();
  addHistory(app, 'Compléments demandés par le partenaire');
  addMessage(appId, currentUser.id,
    'Merci de nous transmettre des éléments complémentaires dans le cadre de la mise en relation.');
  saveDB();
  render();
}

/* ============================================================
   Vues ADMIN
   ============================================================ */
function adminComptesView() {
  const pending = DB.users.filter(u => u.status === 'pending' && u.role !== 'admin');
  const others = DB.users.filter(u => u.status !== 'pending' && u.role !== 'admin');
  const row = (u, actions) => '<tr><td>' + esc(u.role === 'etudiant' ?
    u.prenom + ' ' + u.nom : u.organisation) + '</td>' +
    '<td>' + esc(u.email) + '</td>' +
    '<td>' + (u.role === 'etudiant' ?
      esc(u.composante + ' — ' + u.diplome + ' ' + u.niveau) : esc(u.pays || '')) + '</td>' +
    '<td>' + statusBadge(u.status) + '</td>' +
    '<td>' + actions + '</td></tr>';
  return '<h1>Gestion des comptes</h1>' +
    '<h2>Comptes en attente de validation (' + pending.length + ')</h2>' +
    (pending.length === 0 ? '<div class="empty">Aucun compte en attente.</div>' :
      '<div class="table-wrap"><table><tr><th>Utilisateur</th><th>Email</th><th>Détails</th><th>Statut</th><th>Actions</th></tr>' +
      pending.map(u => row(u,
        '<button class="btn success small" onclick="setUserStatus(\'' + u.id + '\',\'active\')">Valider</button> ' +
        '<button class="btn danger small" onclick="setUserStatus(\'' + u.id + '\',\'refused\')">Refuser</button>'
      )).join('') + '</table></div>') +
    '<h2>Comptes existants</h2>' +
    '<div class="table-wrap"><table><tr><th>Utilisateur</th><th>Email</th><th>Détails</th><th>Statut</th><th>Actions</th></tr>' +
    others.map(u => row(u, u.status === 'active' && u.role !== 'admin' ?
      '<button class="btn danger small" onclick="setUserStatus(\'' + u.id + '\',\'refused\')">Désactiver</button>' : '—'
    )).join('') + '</table></div>';
}

function setUserStatus(id, status) {
  const u = getUser(id);
  if (!u) return;
  u.status = status;
  saveDB();
  render();
}

function adminCandidaturesView() {
  const apps = DB.applications.slice().sort((a, b) => b.date.localeCompare(a.date));
  const toDo = apps.filter(a => a.status === 'reteneue' || a.status === 'conditions_acceptees').length;
  return '<h1>Suivi des candidatures</h1>' +
    '<p class="subtitle">' + toDo + ' action(s) vous concernant : envoi des conditions générales et mises en relation.</p>' +
    (apps.length === 0 ? '<div class="empty">Aucune candidature enregistrée.</div>' :
      apps.map(adminAppCard).join(''));
}

function adminAppCard(app) {
  const s = getSubject(app.subjectId);
  const st = getUser(app.studentId);
  const partner = getUser(s.partnerId);
  const alert = needsAdminRelance(app) ?
    '<div class="alert">⏰ Pas de réponse de l\'entreprise depuis plus de 7 jours — l\'étudiant a été invité à vous contacter.</div>' : '';
  let actions = '<div class="actions-row">';
  if (app.status === 'reteneue') {
    actions += '<button class="btn small" onclick="sendConditions(\'' + app.id + '\')">📨 Envoyer les conditions générales</button>';
  }
  if (app.status === 'conditions_acceptees') {
    actions += '<button class="btn small" onclick="establishRelation(\'' + app.id + '\')">🤝 Établir la mise en relation</button>';
  }
  actions += '</div>';
  return '<div class="card"><h3>' + esc(st.prenom + ' ' + st.nom) + ' → ' + esc(s.titre) + '</h3>' +
    '<div class="meta">' + esc(st.composante) + ' · ' + esc(st.diplome) + ' ' + esc(st.niveau) +
    ' · Partenaire : ' + esc(partner.organisation) + ' · ' + fmtDate(app.date) +
    ' &nbsp; ' + statusBadge(app.status) + '</div>' +
    '<div class="steps">' + STATUS_ORDER.map(x =>
      '<span class="step' + (STATUS_ORDER.indexOf(app.status) > STATUS_ORDER.indexOf(x) ? ' done' :
        app.status === x ? ' current' : '') + '">' + esc(STATUS_LABELS[x]) + '</span>').join('') + '</div>' +
    (app.status === 'refusee' ? '<div class="alert error">Candidature refusée.</div>' : '') +
    alert +
    '<div class="attachments">' + attachmentsHtml(app) + '</div>' +
    actions +
    messagesHtml(app) +
    '</div>';
}

function sendConditions(appId) {
  const app = getApplication(appId);
  const conditions = DB.settings.conditions;
  app.status = 'conditions';
  addHistory(app, "Conditions générales envoyées par l'administrateur");
  addMessage(appId, currentUser.id,
    'Bonjour,\n\nVotre dossier a été retenu. Avant de poursuivre la procédure, merci de prendre ' +
    'connaissance des conditions générales proposées pour les stages et de les accepter :\n\n' +
    conditions);
  saveDB();
  render();
}

function establishRelation(appId) {
  const app = getApplication(appId);
  app.status = 'mise_en_relation';
  app.lastPartnerActivity = new Date().toISOString();
  addHistory(app, "Mise en relation établie par l'administrateur");
  addMessage(appId, currentUser.id,
    "La mise en relation avec l'entreprise est établie. Vous allez être contacté(e). " +
    'Préparez les compléments demandés en réponse à cette mise en relation. ' +
    "Important : si vous ne recevez pas de réponse de l'entreprise pendant plus de 7 jours, " +
    "revenez vers l'administrateur.");
  saveDB();
  render();
}

function adminConditionsView() {
  return '<h1>Conditions générales des stages</h1>' +
    '<p class="subtitle">Ce texte est envoyé aux étudiants lors de l\'étape « Conditions à accepter ».</p>' +
    '<div class="card"><form onsubmit="saveConditions(event)">' +
    '<div class="form-group"><textarea id="cond-text" style="min-height:220px">' +
    esc(DB.settings.conditions) + '</textarea></div>' +
    '<button class="btn" type="submit">Enregistrer</button></form></div>';
}

function saveConditions(ev) {
  ev.preventDefault();
  DB.settings.conditions = document.getElementById('cond-text').value;
  saveDB();
  render();
  alert('Conditions générales enregistrées.');
}

/* ---------- Analyse des données ---------- */
function barChart(title, data) {
  const max = Math.max(1, ...data.map(d => d.value));
  return '<div class="chart"><h3>' + esc(title) + '</h3>' +
    (data.length === 0 ? '<div class="form-hint">Aucune donnée.</div>' :
      data.map(d =>
        '<div class="bar-row"><div class="bar-label">' + esc(d.label) + '</div>' +
        '<div class="bar-track"><div class="bar-fill" style="width:' +
        Math.round(d.value / max * 100) + '%"></div></div>' +
        '<div class="bar-value">' + d.value + '</div></div>').join('')) +
    '</div>';
}

function countBy(items, keyFn) {
  const map = {};
  items.forEach(i => {
    const k = keyFn(i) || 'Non renseigné';
    map[k] = (map[k] || 0) + 1;
  });
  return Object.entries(map).map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

function adminAnalyseView() {
  const students = DB.users.filter(u => u.role === 'etudiant');
  const partners = DB.users.filter(u => u.role === 'partenaire');
  const apps = DB.applications;
  const abouties = apps.filter(a => a.status === 'aboutie').length;
  const refusees = apps.filter(a => a.status === 'refusee').length;
  const traitees = abouties + refusees;
  const taux = traitees ? Math.round(abouties / traitees * 100) : 0;
  const relances = apps.filter(needsAdminRelance).length;

  const stat = (v, l) => '<div class="stat-card"><div class="value">' + v + '</div><div class="label">' + l + '</div></div>';

  return '<h1>Analyse des données</h1>' +
    '<p class="subtitle">Vue d\'ensemble de la plateforme — thématique ' + esc(DB.settings.theme) + '</p>' +
    '<div class="stats-grid">' +
    stat(DB.subjects.length, 'Sujets de stage') +
    stat(students.filter(u => u.status === 'active').length, 'Étudiants validés') +
    stat(partners.filter(u => u.status === 'active').length, 'Partenaires validés') +
    stat(apps.length, 'Candidatures') +
    stat(taux + ' %', "Taux d'aboutie") +
    stat(relances, 'Candidatures sans réponse (7 j+)') +
    '</div>' +
    '<div class="card">' +
    barChart('Candidatures par statut', countBy(apps, a => STATUS_LABELS[a.status])) +
    barChart('Sujets de stage par pays', countBy(DB.subjects, s => s.pays)) +
    barChart('Candidatures par composante', countBy(apps, a => {
      const st = getUser(a.studentId); return st ? st.composante : '';
    })) +
    barChart('Candidatures par diplôme', countBy(apps, a => {
      const st = getUser(a.studentId); return st ? st.diplome : '';
    })) +
    '</div>';
}

/* ============================================================
   Modal
   ============================================================ */
function openModal(html) {
  document.getElementById('modal-root').innerHTML =
    '<div class="modal-overlay" onclick="if(event.target===this)closeModal()">' +
    '<div class="modal">' + html + '</div></div>';
}

function closeModal() {
  document.getElementById('modal-root').innerHTML = '';
}

/* ============================================================
   Initialisation
   ============================================================ */
window.addEventListener('DOMContentLoaded', async () => {
  DB = await loadDB();
  currentUser = restoreSession();
  go(currentUser ? homeView() : 'login');
});
