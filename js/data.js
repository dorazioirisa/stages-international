/* ============================================================
   Couche de données — localStorage
   ============================================================ */

const STORAGE_KEY = 'stages_intl_v1';
const SESSION_KEY = 'stages_intl_session';
const MAX_FILE_BYTES = 1.2 * 1024 * 1024; /* 1,2 Mo par fichier */

const COUNTRIES = [
  'Allemagne','Argentine','Australie','Autriche','Belgique','Brésil','Bulgarie',
  'Canada','Chili','Chine','Chypre','Colombie','Corée du Sud','Croatie','Danemark',
  'Égypte','Émirats arabes unis','Espagne','Estonie','États-Unis','Finlande','France',
  'Grèce','Hongrie','Inde','Irlande','Islande','Israël','Italie','Japon','Lettonie',
  'Lituanie','Luxembourg','Malte','Maroc','Mexique','Norvège','Nouvelle-Zélande',
  'Pays-Bas','Pologne','Portugal','Roumanie','Royaume-Uni','Russie','Sénégal',
  'Serbie','Singapour','Slovaquie','Slovénie','Suède','Suisse','Taïwan','Tchéquie',
  'Thaïlande','Tunisie','Turquie','Ukraine','Vietnam','Autre'
];

const DIPLOMES = ['Bachelor', 'Master'];
const NIVEAUX = ['1ère année', '2ème année', '3ème année'];
const PROFILS = {
  bachelor: 'Bachelor',
  master: 'Master',
  both: 'Bachelor ou Master'
};

const THEMES = 'Informatique / Numérique';

const DEFAULT_CONDITIONS =
  "Conditions générales des stages internationaux (informatique / numérique) :\n\n" +
  "1. Le stage doit faire l'objet d'une convention signée par les trois parties " +
  "(étudiant, organisme d'accueil, composante) avant le départ.\n" +
  "2. La durée du stage doit être conforme au règlement de la composante.\n" +
  "3. L'étudiant doit souscrire une assurance responsabilité civile et couverture " +
  "santé valable dans le pays d'accueil.\n" +
  "4. La gratification éventuelle est celle indiquée sur le sujet de stage.\n" +
  "5. L'étudiant s'engage à fournir les compléments demandés dans les délais et à " +
  "rendre compte à l'administrateur en cas de difficulté.\n" +
  "6. En cas de désaccord, l'administrateur reste l'arbitre de la procédure.";

/* ---------- Statuts de candidature ---------- */
const STATUS_ORDER = ['soumise', 'reteneue', 'conditions', 'conditions_acceptees',
  'mise_en_relation', 'complements', 'aboutie'];

const STATUS_LABELS = {
  soumise: 'Soumise',
  reteneue: 'Dossier retenu',
  conditions: 'Conditions à accepter',
  conditions_acceptees: 'Conditions acceptées',
  mise_en_relation: 'Mise en relation',
  complements: 'Compléments fournis',
  aboutie: 'Aboutie',
  refusee: 'Refusée'
};

const ROLE_LABELS = {
  admin: 'Administrateur',
  etudiant: 'Étudiant',
  partenaire: 'Partenaire'
};

/* ---------- Utilitaires ---------- */
function uid(prefix) {
  return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtDateTime(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ' à ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function daysSince(iso) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 3600 * 1000));
}

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    if (file.size > MAX_FILE_BYTES) {
      reject(new Error('« ' + file.name + ' » dépasse la limite de 1,2 Mo.'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, type: file.type, data: reader.result });
    reader.onerror = () => reject(new Error('Impossible de lire « ' + file.name + ' ».'));
    reader.readAsDataURL(file);
  });
}

function readInputFiles(input) {
  const files = Array.from(input.files || []);
  if (!files.length) return Promise.resolve([]);
  return Promise.all(files.map(readFileAsDataURL));
}

/* ---------- Persistance ---------- */
function saveDB() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DB));
  } catch (e) {
    alert("Espace de stockage local dépassé. Essayez avec des fichiers plus légers.");
    throw e;
  }
}

function loadDB() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try { return JSON.parse(raw); } catch (e) { /* réinitialisation */ }
  }
  return seedDB();
}

async function seedDB() {
  const db = {
    users: [],
    subjects: [],
    applications: [],
    messages: [],
    settings: { conditions: DEFAULT_CONDITIONS, theme: THEMES }
  };

  const adminPass = await sha256('admin123');
  const partnerPass = await sha256('partner123');
  const studentPass = await sha256('etu123');

  db.users.push({
    id: 'u_admin', role: 'admin', email: 'admin@stages.fr', pass: adminPass,
    status: 'active', createdAt: new Date().toISOString()
  });

  db.users.push({
    id: 'u_partner1', role: 'partenaire', email: 'contact@techcorp.de', pass: partnerPass,
    status: 'active', organisation: 'TechCorp GmbH', pays: 'Allemagne',
    createdAt: new Date().toISOString()
  });
  db.users.push({
    id: 'u_partner2', role: 'partenaire', email: 'stages@univ-munich.de', pass: partnerPass,
    status: 'active', organisation: 'Université de Munich', pays: 'Allemagne',
    createdAt: new Date().toISOString()
  });

  db.users.push({
    id: 'u_etu1', role: 'etudiant', email: 'lea.dupont@iut-grenoble.fr', pass: studentPass,
    status: 'active', nom: 'Dupont', prenom: 'Léa', composante: 'IUT de Grenoble',
    diplome: 'Bachelor', niveau: '2ème année', dateDebut: '2026-06-01',
    dateFin: '2026-08-31', flexible: true, createdAt: new Date().toISOString()
  });

  db.subjects.push({
    id: 's_1', partnerId: 'u_partner1', titre: 'Développement web — application React',
    description: "Participez au développement d'une application web React utilisée par nos clients européens. Travail en équipe agile au cœur de Berlin.",
    entreprise: 'TechCorp GmbH', pays: 'Allemagne', adresse: 'Alexanderplatz 1, Berlin',
    contactNom: 'Müller', contactPrenom: 'Anna', contactEmail: 'anna.mueller@techcorp.de',
    profil: 'both', prerequis: 'JavaScript, React, notions de Git', duree: '3 mois',
    gratification: 1100, deadline: '2026-04-30', status: 'open',
    createdAt: new Date().toISOString()
  });
  db.subjects.push({
    id: 's_2', partnerId: 'u_partner1', titre: 'Data engineering — pipelines de données',
    description: "Conception et mise en place de pipelines de traitement de données (Python, Spark) pour notre plateforme analytique.",
    entreprise: 'TechCorp GmbH', pays: 'Allemagne', adresse: 'Alexanderplatz 1, Berlin',
    contactNom: 'Müller', contactPrenom: 'Anna', contactEmail: 'anna.mueller@techcorp.de',
    profil: 'master', prerequis: 'Python, SQL, bases du Big Data', duree: '6 mois',
    gratification: 1300, deadline: '2026-03-15', status: 'open',
    createdAt: new Date().toISOString()
  });
  db.subjects.push({
    id: 's_3', partnerId: 'u_partner2', titre: 'Recherche en intelligence artificielle',
    description: "Stage de recherche au sein du laboratoire d'apprentissage automatique : modèles de vision par ordinateur appliqués à la médecine.",
    entreprise: 'Université de Munich', pays: 'Allemagne', adresse: 'Geschwister-Scholl-Platz 1, Munich',
    contactNom: 'Schmidt', contactPrenom: 'Hans', contactEmail: 'hans.schmidt@univ-munich.de',
    profil: 'master', prerequis: 'Apprentissage automatique, PyTorch, bon niveau de rédaction scientifique',
    duree: '5 mois', gratification: 0, deadline: '2026-02-28', status: 'open',
    createdAt: new Date().toISOString()
  });
  db.subjects.push({
    id: 's_4', partnerId: 'u_partner2', titre: 'Administration systèmes et réseaux',
    description: "Participez à l'administration du parc serveurs de l'université : virtualisation, supervision, sécurité réseau.",
    entreprise: 'Université de Munich', pays: 'Allemagne', adresse: 'Geschwister-Scholl-Platz 1, Munich',
    contactNom: 'Schmidt', contactPrenom: 'Hans', contactEmail: 'hans.schmidt@univ-munich.de',
    profil: 'bachelor', prerequis: 'Linux, réseaux TCP/IP, virtualisation', duree: '4 mois',
    gratification: 900, deadline: '2026-05-15', status: 'open',
    createdAt: new Date().toISOString()
  });

  db.applications.push({
    id: 'a_1', subjectId: 's_1', studentId: 'u_etu1',
    message: "Très intéressée par ce sujet, j'ai réalisé plusieurs projets en React durant ma formation.",
    cv: { name: 'CV_Dupont_Léa.pdf', type: 'application/pdf', data: 'data:application/pdf;base64,' },
    referentEmail: 'j.martin@iut-grenoble.fr',
    bulletins: [], lettres: [],
    date: new Date().toISOString(),
    status: 'soumise',
    lastPartnerActivity: new Date().toISOString(),
    history: [{ date: new Date().toISOString(), label: 'Candidature soumise' }]
  });

  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  return db;
}

/* ---------- Accès aux données ---------- */
function getUser(id) { return DB.users.find(u => u.id === id); }
function getSubject(id) { return DB.subjects.find(s => s.id === id); }
function getApplication(id) { return DB.applications.find(a => a.id === id); }
function getMessages(appId) {
  return DB.messages.filter(m => m.appId === appId).sort((a, b) => a.date.localeCompare(b.date));
}
function addMessage(appId, fromId, text) {
  DB.messages.push({ id: uid('m'), appId, fromId, text, date: new Date().toISOString() });
}
function addHistory(app, label) {
  app.history.push({ date: new Date().toISOString(), label });
}
