import http from "node:http";
import { copyFile, mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";
import { randomUUID } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const bundledDataPath = join(__dirname, "data", "db.json");
const dataDir = process.env.DATA_DIR || join(__dirname, "data");
const dataPath = join(dataDir, "db.json");
const publicDir = join(__dirname, "public");
const port = Number(process.env.PORT || 8080);

async function loadDb() {
  await ensureDataFile();
  const db = JSON.parse(await readFile(dataPath, "utf8"));
  db.professors ||= [];
  db.students ||= [];
  db.exercises ||= [];
  ensureFinance(db);
  if (await syncExerciseImages(db)) await saveDb(db);
  return db;
}

async function ensureDataFile() {
  await mkdir(dataDir, { recursive: true });
  if (!existsSync(dataPath)) await copyFile(bundledDataPath, dataPath);
}

async function saveDb(db) {
  await ensureDataFile();
  db.updatedAt = new Date().toISOString();
  await writeFile(dataPath, JSON.stringify(db, null, 2), "utf8");
}

function send(res, status, body, type = "text/html; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(body);
}

function json(res, status, value) {
  send(res, status, JSON.stringify(value), "application/json; charset=utf-8");
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}

function okPassword(req, db, role) {
  return req.headers["x-password"] === db.passwords?.[role];
}

function ensureFinance(db) {
  db.admins ||= [{ id: "admin-principal", name: "Administrador principal", username: "admin", password: db.passwords?.admin || "admin2026", blocked: false, primary: true }];
  db.plans ||= [
    { id: "plano-mensal", name: "Mensal", type: "mensal", price: 100, active: true },
    { id: "plano-trimestral", name: "Trimestral", type: "trimestral", price: 270, active: true },
    { id: "plano-semestral", name: "Semestral", type: "semestral", price: 500, active: true },
    { id: "plano-anual", name: "Anual", type: "anual", price: 900, active: true },
    { id: "plano-diarista", name: "Diarista", type: "diarista", price: 15, active: true },
    { id: "plano-prepago", name: "Pre-pago", type: "prepago", price: 0, active: true }
  ];
  db.payments ||= [];
  db.attendance ||= [];
  db.faceSessions ||= [];
  db.turnstile ||= {
    enabled: true,
    name: "Henry 7x",
    ip: "10.0.0.236",
    port: 3000,
    connectorToken: "fusion-catraca-2026"
  };
  db.turnstileCommands ||= [];
  db.turnstileEvents ||= [];
  db.products ||= [
    { id: "produto-agua", name: "Agua", price: 3, stock: 0, active: true },
    { id: "produto-isotonico", name: "Isotonico", price: 7, stock: 0, active: true }
  ];
  for (const student of db.students || []) student.photo ||= "";
  for (const student of db.students || []) student.status ||= student.deleted ? "Excluido" : student.inactive ? "Inativo" : "Ativo";
  const exerciseGroups = {
    "ex-01": "Quadriceps",
    "ex-02": "Peito",
    "ex-03": "Costa",
    "ex-04": "Costa",
    "ex-05": "Trapezio",
    "ex-06": "Biceps",
    "ex-07": "Triceps",
    "ex-08": "Quadriceps",
    "ex-09": "Quadriceps",
    "ex-10": "Gluteo",
    "ex-11": "Quadriceps",
    "ex-12": "Abdomem",
    "ex-13": "Peito",
    "ex-14": "Cardio",
    "ex-15": "Cardio",
    "ex-16": "Cardio",
    "ex-17": "Gluteo",
    "ex-18": "Costa",
    "ex-19": "Trapezio",
    "ex-20": "Abdomem"
  };
  for (const exercise of db.exercises || []) exercise.group = exerciseGroups[exercise.id] || exercise.group || "Outros";
}

function currentAdmin(req, db) {
  ensureFinance(db);
  const username = req.headers["x-admin-user"] || "admin";
  const password = cleanPassword(req.headers["x-password"]);
  return db.admins.find((admin) => normalize(admin.username) === normalize(username) && cleanPassword(admin.password) === password && !admin.blocked);
}

function okAdmin(req, db) {
  return Boolean(currentAdmin(req, db));
}

function okStudentPassword(req, db, student) {
  const informed = cleanPassword(req.headers["x-password"]);
  const accepted = [
    student?.access?.accessPassword,
    student?.accessPassword,
    student?.password,
    db.passwords?.student
  ].map(cleanPassword).filter(Boolean);
  return accepted.includes(informed);
}

function okStudentFaceToken(req, db, student) {
  const token = req.headers["x-face-token"];
  if (!token || !student) return false;
  const now = Date.now();
  db.faceSessions = (db.faceSessions || []).filter((session) => new Date(session.expiresAt).getTime() > now);
  return db.faceSessions.some((session) => session.token === token && session.studentId === student.id);
}

function okProfessorPassword(req, db, professorId) {
  const professor = db.professors.find((item) => item.id === professorId);
  if (!professor || professor.blocked) return false;
  return cleanPassword(req.headers["x-password"]) === cleanPassword(professor.password || db.passwords?.professor);
}

function okAnyProfessorPassword(req, db) {
  const informed = cleanPassword(req.headers["x-password"]);
  return db.professors.some((professor) => !professor.blocked && informed === cleanPassword(professor.password || db.passwords?.professor));
}

function normalize(value = "") {
  return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

function cleanPassword(value = "") {
  return String(value ?? "").trim();
}

function onlyDigits(value = "") {
  return String(value).replace(/\D/g, "");
}

function studentStatus(student) {
  return student?.status || (student?.deleted ? "Excluido" : student?.inactive ? "Inativo" : "Ativo");
}

function canStudentAccess(student) {
  return Boolean(student && !student.blocked && studentStatus(student) === "Ativo");
}

function studentAccessMessage(student) {
  if (!student) return "Aluno nao encontrado.";
  if (student.deleted || studentStatus(student) === "Excluido") return "Aluno excluido. Procure a administracao.";
  if (student.inactive || studentStatus(student) === "Inativo") return "Aluno inativo. Procure a administracao.";
  if (student.blocked) return "Aluno bloqueado. Procure a administracao.";
  return "";
}

function createTurnstileCommand(db, student, reason = "manual") {
  db.turnstileCommands ||= [];
  const command = {
    id: `catraca-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    type: "open",
    reason,
    holdSeconds: reason === "student-page" ? 10 : 3,
    studentId: student.id,
    studentName: student.name,
    status: "pending",
    attempts: 0,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60 * 1000).toISOString()
  };
  db.turnstileCommands.push(command);
  return command;
}

function offlineTurnstileStudents(db) {
  return (db.students || [])
    .filter((student) => canStudentAccess(student) && (!student.paymentStatus || student.paymentStatus === "Em dia"))
    .map((student) => ({
      id: student.id,
      slug: student.slug,
      name: student.name,
      cpf: onlyDigits(student.cpf),
      registration: onlyDigits(student.registration),
      accessCardNumber: onlyDigits(student.access?.accessCardNumber),
      paymentStatus: student.paymentStatus || "Em dia",
      status: studentStatus(student),
      blocked: Boolean(student.blocked),
      updatedAt: db.updatedAt || new Date().toISOString()
    }));
}

function slugify(value) {
  return normalize(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "cadastro";
}

function titleFromFile(value = "") {
  const base = String(value).replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim();
  return base.replace(/\s+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) || "Exercicio";
}

function exerciseGroupFromFolder(folder = "") {
  const key = normalize(folder).replace(/[^a-z0-9]/g, "");
  const groups = {
    abdome: "Abdomem",
    abdomen: "Abdomem",
    abdomem: "Abdomem",
    antebraco: "Antebraco",
    antebrco: "Antebraco",
    biceps: "Biceps",
    cardio: "Cardio",
    costa: "Costa",
    costas: "Costa",
    gluteo: "Gluteo",
    gluteos: "Gluteo",
    ombro: "Ombro",
    ombros: "Ombro",
    panturilha: "Panturilha",
    panturrilha: "Panturilha",
    peito: "Peito",
    posterior: "Posterior",
    quadriceps: "Quadriceps",
    steep: "Cardio",
    step: "Cardio",
    trapezio: "Trapezio",
    trapesio: "Trapezio",
    triceps: "Triceps"
  };
  return groups[key] || titleFromFile(folder);
}

async function syncExerciseImages(db) {
  const root = join(publicDir, "assets", "exercises");
  if (!existsSync(root)) return false;
  const imageExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg"]);
  const existing = new Set((db.exercises || []).map((exercise) => exercise.image));
  let changed = false;
  for (const folder of await readdir(root, { withFileTypes: true })) {
    if (!folder.isDirectory()) continue;
    const group = exerciseGroupFromFolder(folder.name);
    const folderPath = join(root, folder.name);
    for (const file of await readdir(folderPath, { withFileTypes: true })) {
      if (!file.isFile()) continue;
      const extension = extname(file.name).toLowerCase();
      if (!imageExtensions.has(extension)) continue;
      const image = `/assets/exercises/${encodeURIComponent(folder.name)}/${encodeURIComponent(file.name)}`;
      if (existing.has(image)) continue;
      db.exercises.push({
        id: `foto-${slugify(folder.name)}-${slugify(file.name.replace(/\.[^.]+$/, ""))}`,
        name: titleFromFile(file.name),
        image,
        group
      });
      existing.add(image);
      changed = true;
    }
  }
  return changed;
}

function uniqueSlug(db, name) {
  const base = slugify(name);
  let slug = base;
  let i = 2;
  while (db.students.some((student) => student.slug === slug || student.id === slug)) {
    slug = `${base}-${i}`;
    i += 1;
  }
  return slug;
}

function professorName(db, id) {
  return db.professors.find((professor) => professor.id === id)?.name || "Sem professor";
}

function nextRegistration(db) {
  const numbers = (db.students || []).map((student) => Number(onlyDigits(student.registration))).filter(Boolean);
  return String((numbers.length ? Math.max(...numbers) : 0) + 1).padStart(5, "0");
}

function normalizeBirthDate(value, ageHint = "") {
  const digits = onlyDigits(value);
  if (digits.length < 6) return String(value || "");
  const day = digits.slice(0, 2);
  const month = digits.slice(2, 4);
  let year = digits.slice(4);
  if (year.length === 2) {
    const currentYear = new Date().getFullYear();
    const age = Number(ageHint || 0);
    if (age >= 0 && age < 130) {
      const candidates = [];
      for (let candidate = currentYear - age - 1; candidate <= currentYear - age + 1; candidate += 1) candidates.push(String(candidate));
      const byAge = candidates.find((candidate) => {
        const candidateDate = `${day}/${month}/${candidate}`;
        return calculateAgeFromBirthDate(candidateDate) === String(age) && (candidate.startsWith(year) || candidate.endsWith(year));
      });
      year = byAge || (String(currentYear - age).slice(0, 2) + year);
    } else {
      const yy = Number(year);
      year = yy > Number(String(currentYear).slice(2)) ? "19" + year : "20" + year;
    }
  }
  if (year.length !== 4) return String(value || "");
  const formatted = `${day}/${month}/${year}`;
  return calculateAgeFromBirthDate(formatted) ? formatted : String(value || "");
}

function calculateAgeFromBirthDate(value) {
  const parts = String(value || "").split("/");
  if (parts.length !== 3) return "";
  const day = Number(parts[0]);
  const month = Number(parts[1]);
  const year = Number(parts[2]);
  if (!day || !month || !year || year < 1900) return "";
  const birth = new Date(year, month - 1, day);
  if (birth.getDate() !== day || birth.getMonth() !== month - 1 || birth.getFullYear() !== year) return "";
  const today = new Date();
  let age = today.getFullYear() - year;
  const birthdayThisYear = new Date(today.getFullYear(), month - 1, day);
  if (today < birthdayThisYear) age -= 1;
  return age >= 0 && age < 130 ? String(age) : "";
}

function buildStudent(db, body) {
  const slug = uniqueSlug(db, body.name || "Aluno");
  const plan = db.plans.find((item) => item.id === body.planId);
  const birthDate = normalizeBirthDate(body.birthDate, body.age);
  const age = body.age || calculateAgeFromBirthDate(birthDate);
  return {
    id: slug,
    slug,
    name: body.name || "Aluno",
    photo: body.photo || "",
    faceVector: Array.isArray(body.faceVector) ? body.faceVector : [],
    cpf: onlyDigits(body.cpf),
    registration: body.registration || nextRegistration(db),
    address: body.address || "",
    district: body.district || "",
    zipCode: body.zipCode || "",
    city: body.city || "",
    state: body.state || "",
    phone: body.phone || "",
    mobile: body.mobile || body.phone || "",
    gender: body.gender || "",
    identity: body.identity || "",
    identityState: body.identityState || "",
    email: body.email || "",
    birthDate,
    age,
    situation: body.situation || "Ativo",
    debit: body.debit || "",
    registrationNotes: body.registrationNotes || "",
    medicalExamValidUntil: body.medicalExamValidUntil || "",
    physicalAssessmentValidUntil: body.physicalAssessmentValidUntil || "",
    objective: body.objective || "",
    profession: body.profession || "",
    maritalStatus: body.maritalStatus || "",
    company: body.company || "",
    companyPhone: body.companyPhone || "",
    referralSource: body.referralSource || "",
    fatherName: body.fatherName || "",
    fatherPhone: body.fatherPhone || "",
    motherName: body.motherName || "",
    motherPhone: body.motherPhone || "",
    extraInfo: body.extraInfo || "",
    accessRules: {
      restrictedSchedule: body.restrictedSchedule === "sim",
      scheduleDay: body.scheduleDay || "",
      scheduleEntry: body.scheduleEntry || "",
      scheduleExit: body.scheduleExit || "",
      schedulePlace: body.schedulePlace || "",
      scheduleClass: body.scheduleClass || "",
      limitDailyAccess: body.limitDailyAccess === "sim",
      accessesPerDay: body.accessesPerDay || "",
      limitWeeklyAccess: body.limitWeeklyAccess === "sim",
      accessesPerWeek: body.accessesPerWeek || "",
      reentryControl: body.reentryControl === "sim",
      reentryMinutes: body.reentryMinutes || "",
      reentrySeconds: body.reentrySeconds || ""
    },
    access: {
      hasAccessCard: body.hasAccessCard || "Nao",
      accessCardNumber: body.accessCardNumber || "",
      accessPassword: body.accessPassword || body.password || "",
      fingerprintStatus: body.fingerprintStatus || ""
    },
    professorId: body.professorId || db.professors[0]?.id || "",
    planId: plan?.id || body.planId || "",
    paymentDue: body.paymentDue || "",
    paymentStatus: body.paymentStatus || "Em dia",
    plan: plan?.name || body.plan || "Musculacao",
    status: body.status || "Ativo",
    blocked: body.blocked === true || body.blocked === "sim",
    frequency: "Sem frequencia registrada",
    lastCheckin: "",
    assessmentData: {},
    routine: { exercises: [] },
    notes: body.notes || ""
  };
}

function addMonths(dateText, months = 1) {
  const source = dateText ? new Date(`${dateText}T12:00:00`) : new Date();
  if (Number.isNaN(source.getTime())) return "";
  const day = source.getDate();
  source.setMonth(source.getMonth() + months);
  if (source.getDate() !== day) source.setDate(0);
  return source.toISOString().slice(0, 10);
}

function monthsForPlan(plan) {
  const type = normalize(plan?.type || plan?.name || "");
  if (type.includes("trimestral")) return 3;
  if (type.includes("semestral")) return 6;
  if (type.includes("anual")) return 12;
  return 1;
}

function hasActivationPayment(db, studentId) {
  return (db.payments || []).some((payment) => payment.studentId === studentId && ["matricula", "mensalidade"].includes(payment.source || ""));
}

function registerStudentPayment(db, student, plan, body = {}) {
  db.payments ||= [];
  if (!student || hasActivationPayment(db, student.id)) return null;
  const nextDue = body.nextDue || body.paymentDue || addMonths("", monthsForPlan(plan));
  const payment = {
    id: `pagamento-${Date.now()}`,
    source: body.source || "matricula",
    studentId: student.id,
    studentName: student.name,
    planId: plan?.id || student.planId || "",
    planName: plan?.name || student.plan || "",
    amount: Number(body.amount || plan?.price || 0),
    method: body.method || "pix",
    paidMonth: body.paidMonth || new Date().toISOString().slice(0, 7),
    nextDue,
    paidAt: new Date().toISOString()
  };
  db.payments.push(payment);
  if (plan) {
    student.planId = plan.id;
    student.plan = plan.name;
  }
  if (nextDue) student.paymentDue = nextDue;
  student.paymentStatus = "Em dia";
  student.blocked = false;
  student.status = "Ativo";
  return payment;
}

function compareFaceVectors(a = [], b = []) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length < 100 || a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i += 1) dot += Number(a[i] || 0) * Number(b[i] || 0);
  return Math.max(0, Math.min(100, Math.round(((dot / a.length) + 1) * 50)));
}

function isUsableFaceVector(faceVector = []) {
  if (!Array.isArray(faceVector) || faceVector.length < 100) return false;
  const values = faceVector.map((value) => Number(value || 0)).filter(Number.isFinite);
  if (values.length !== faceVector.length) return false;
  const energy = values.reduce((sum, value) => sum + Math.abs(value), 0) / values.length;
  const spread = Math.max(...values) - Math.min(...values);
  return energy > 0.05 && spread > 0.2;
}

function findFaceDuplicate(db, faceVector, ignoreStudentId = "") {
  if (!isUsableFaceVector(faceVector)) return null;
  let best = null;
  for (const student of db.students || []) {
    if (ignoreStudentId && student.id === ignoreStudentId) continue;
    const score = compareFaceVectors(student.faceVector, faceVector);
    if (score && (!best || score > best.score)) best = { student, score };
  }
  return best && best.score >= 90 ? best : null;
}

function shell(title, body) {
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
  <title>${title}</title>
  <link rel="stylesheet" href="/assets/site.css">
</head>
<body>${body}
<script>
  let lastTouchEnd = 0;
  document.addEventListener('touchend', function(event) {
    const now = Date.now();
    if (now - lastTouchEnd <= 450) event.preventDefault();
    lastTouchEnd = now;
  }, { passive: false });
  document.addEventListener('gesturestart', function(event) {
    event.preventDefault();
  }, { passive: false });
</script></body>
</html>`;
}

function topbar() {
  return `<header class="topbar">
    <nav class="nav">
      <a class="brand" href="/"><span class="brand-mark">FCF</span><span>Fusion Combat Fit</span></a>
    </nav>
  </header>`;
}

function homePage() {
  return shell("Fusion Combat Fit", `${topbar()}
  <main>
    <section class="hero">
      <div class="hero-inner">
        <div class="eyebrow">Sistema online</div>
        <h1>Academia Fusion Combat Fit</h1>
        <p>Portal online para matricula, alunos, professores, presenca e administracao da academia.</p>
        <div class="actions">
          <a class="button primary" href="/alunos">Acesso do aluno</a>
          <a class="button secondary" href="/matricula">Matricula online</a>
          <a class="button secondary" href="/professor">Acesso do professor</a>
          <a class="button secondary" href="/admin">Acesso do admin</a>
          <a class="button secondary" href="/presenca">Registrar presenca</a>
        </div>
      </div>
    </section>
    <section>
      <div class="wrap">
        <div class="services access-cards">
          <a class="service access-card" href="/matricula"><h3>Matricula online</h3><p>O novo aluno preenche dados, cria senha e tira a foto pelo celular para entrar no cadastro.</p><strong>/matricula</strong></a>
          <a class="service access-card" href="/alunos"><h3>Aluno</h3><p>Busca o proprio cadastro para acessar treino, avaliacao, vencimento e frequencia.</p><strong>/alunos</strong></a>
          <a class="service access-card" href="/professor"><h3>Professor</h3><p>Entra na area do professor para montar treinos e registrar avaliacoes.</p><strong>/professor</strong></a>
          <a class="service access-card" href="/admin"><h3>Administrador</h3><p>Abre o painel da academia para cadastros, caixa, presencas e configuracoes.</p><strong>/admin</strong></a>
        </div>
      </div>
    </section>
    <section id="busca">
      <div class="wrap">
        <div class="section-title">
          <h2>Buscar aluno</h2>
          <p>Digite o nome completo ou CPF cadastrado. A busca nÃ£o mostra sugestÃµes parciais.</p>
        </div>
        <div class="search-controls">
          <input id="q" placeholder="Nome completo ou CPF" autocomplete="off">
          <button class="button primary" id="clear">Limpar</button>
        </div>
        <div id="results" class="results"><p class="empty">Digite o nome completo ou CPF.</p></div>
      </div>
    </section>
  </main>
  <footer>Fusion Combat Fit - servidor online</footer>
  <script>
    const q = document.getElementById('q');
    const results = document.getElementById('results');
    const clear = document.getElementById('clear');
    async function run() {
      const value = q.value.trim();
      if (!value) {
        results.innerHTML = '<p class="empty">Digite o nome completo ou CPF.</p>';
        return;
      }
      const data = await fetch('/api/students?search=' + encodeURIComponent(value)).then((r) => r.json());
      results.innerHTML = data.length
        ? data.map((s) => '<a class="result" href="/aluno/' + s.slug + '"><strong>' + s.name + '</strong><span>Abrir</span></a>').join('')
        : '<p class="empty">Nenhum aluno encontrado. Use o nome completo ou CPF cadastrado.</p>';
    }
    q.addEventListener('input', run);
    clear.addEventListener('click', () => { q.value = ''; q.focus(); run(); });
  </script>`);
}

function enrollmentPage(db) {
  const planOptions = (db.plans || []).filter((plan) => plan.active !== false).map((plan) => '<option value="' + plan.id + '">' + plan.name + ' - R$ ' + Number(plan.price || 0).toFixed(2) + '</option>').join('');
  return shell("Matricula online", `${topbar()}
  <main class="enrollment-page">
    <section class="enrollment-hero">
      <div class="wrap">
        <p class="eyebrow dark">Matricula online</p>
        <h1>Cadastro do aluno</h1>
        <p>Preencha seus dados, crie sua senha de acesso e tire a foto no momento do cadastro.</p>
      </div>
    </section>
    <section>
      <div class="wrap">
        <form id="enrollmentForm" class="editor-form cadastro-form enrollment-form">
          <fieldset>
            <legend>Foto obrigatoria</legend>
            <div class="camera-box">
              <video id="cameraVideo" autoplay playsinline muted hidden></video>
              <canvas id="cameraCanvas" hidden></canvas>
              <div id="photoPreview" class="attendance-preview"><span>Sem foto</span></div>
            </div>
            <div class="camera-actions">
              <button class="button neutral" type="button" id="startCamera">Abrir camera</button>
              <button class="button primary" type="button" id="capturePhoto" disabled>Capturar foto agora</button>
              <label class="button neutral file-button">Tirar foto pelo celular<input id="cameraFile" type="file" accept="image/*" capture="user"></label>
            </div>
            <p class="empty">O cadastro so sera enviado depois que uma foto for capturada.</p>
          </fieldset>
          <fieldset>
            <legend>Dados pessoais</legend>
            <label>Nome completo<input name="name" autocomplete="name" required></label>
            <label>CPF<input name="cpf" inputmode="numeric" autocomplete="off" required></label>
            <label>Data de nascimento<input name="birthDate" inputmode="numeric" placeholder="dd/mm/aaaa" maxlength="10" required></label>
            <label>Idade<input name="age" type="number" readonly></label>
            <label>Telefone / WhatsApp<input name="phone" autocomplete="tel" required></label>
            <label>E-mail<input name="email" type="email" autocomplete="email"></label>
            <label>Sexo<select name="gender"><option value="">Selecione</option><option>Feminino</option><option>Masculino</option><option>Outro</option></select></label>
          </fieldset>
          <fieldset>
            <legend>Endereco</legend>
            <label>Endereco<input name="address" autocomplete="street-address" required></label>
            <label>Bairro<input name="district" required></label>
            <label>CEP<input name="zipCode" inputmode="numeric"></label>
            <label>Cidade<input name="city" required></label>
            <label>UF<input name="state" maxlength="2" required></label>
          </fieldset>
          <fieldset>
            <legend>Acesso e objetivo</legend>
            <label>Plano desejado<select name="planId" id="enrollmentPlan" required><option value="">Escolha o plano</option>${planOptions}</select></label>
            <label>Crie sua senha<input name="password" type="password" autocomplete="new-password" required minlength="4"></label>
            <label>Confirme a senha<input name="confirmPassword" type="password" autocomplete="new-password" required minlength="4"></label>
            <label>Objetivo<textarea name="objective" rows="3" placeholder="Ex.: emagrecimento, ganho de massa, condicionamento"></textarea></label>
            <label>Como nos conheceu?<input name="referralSource"></label>
          </fieldset>
          <button class="button primary enrollment-submit" id="enrollmentSubmit" type="submit" disabled>Enviar matricula</button>
          <div id="enrollmentResult" class="attendance-result empty">Escolha um plano para liberar o envio. Apos enviar, o cadastro aguardara ativacao no painel do administrador.</div>
        </form>
      </div>
    </section>
  </main>
  <script>
    const form = document.getElementById('enrollmentForm');
    const result = document.getElementById('enrollmentResult');
    const video = document.getElementById('cameraVideo');
    const canvas = document.getElementById('cameraCanvas');
    const preview = document.getElementById('photoPreview');
    const startCamera = document.getElementById('startCamera');
    const capturePhoto = document.getElementById('capturePhoto');
    const cameraFile = document.getElementById('cameraFile');
    const enrollmentPlan = document.getElementById('enrollmentPlan');
    const enrollmentSubmit = document.getElementById('enrollmentSubmit');
    let stream = null;
    let photo = '';
    let faceVector = [];
    function updateSubmitState() {
      enrollmentSubmit.disabled = !enrollmentPlan.value;
    }
    function calculateAge(value) {
      const parts = String(value || '').split('/');
      if (parts.length !== 3) return '';
      const day = Number(parts[0]);
      const month = Number(parts[1]);
      const year = Number(parts[2]);
      if (!day || !month || !year || year < 1900) return '';
      const birth = new Date(year, month - 1, day);
      if (birth.getDate() !== day || birth.getMonth() !== month - 1 || birth.getFullYear() !== year) return '';
      const today = new Date();
      let age = today.getFullYear() - year;
      const birthdayThisYear = new Date(today.getFullYear(), month - 1, day);
      if (today < birthdayThisYear) age -= 1;
      return age >= 0 && age < 130 ? String(age) : '';
    }
    function syncBirthDateAge() {
      let value = form.birthDate.value.replace(/\\D/g, '').slice(0, 8);
      if (value.length > 4) value = value.replace(/(\\d{2})(\\d{2})(\\d{1,4})/, '$1/$2/$3');
      else if (value.length > 2) value = value.replace(/(\\d{2})(\\d{1,2})/, '$1/$2');
      form.birthDate.value = value;
      form.age.value = calculateAge(value);
    }
    form.birthDate.addEventListener('input', syncBirthDateAge);
    form.birthDate.addEventListener('keyup', syncBirthDateAge);
    form.birthDate.addEventListener('change', syncBirthDateAge);
    form.birthDate.addEventListener('blur', syncBirthDateAge);
    form.birthDate.addEventListener('paste', () => setTimeout(syncBirthDateAge, 0));
    function setPhoto(value) {
      photo = value || '';
      preview.innerHTML = photo ? '<img src="' + photo + '" alt="Foto capturada">' : '<span>Sem foto</span>';
    }
    function loadImage(src) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
      });
    }
    async function imageVector(src) {
      const img = await loadImage(src);
      const size = 32;
      const vectorCanvas = document.createElement('canvas');
      vectorCanvas.width = size;
      vectorCanvas.height = size;
      const ctx = vectorCanvas.getContext('2d');
      const crop = Math.min(img.naturalWidth || img.width, img.naturalHeight || img.height) * 0.82;
      const sx = ((img.naturalWidth || img.width) - crop) / 2;
      const sy = ((img.naturalHeight || img.height) - crop) / 2;
      ctx.drawImage(img, sx, sy, crop, crop, 0, 0, size, size);
      const pixels = ctx.getImageData(0, 0, size, size).data;
      const values = [];
      for (let i = 0; i < pixels.length; i += 4) values.push((pixels[i] * 0.299) + (pixels[i + 1] * 0.587) + (pixels[i + 2] * 0.114));
      const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
      const variance = values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / values.length;
      const deviation = Math.sqrt(variance) || 1;
      return values.map((value) => Number(((value - mean) / deviation).toFixed(4)));
    }
    async function setFacePhoto(value) {
      setPhoto(value);
      faceVector = photo ? await imageVector(photo).catch(() => []) : [];
    }
    function fileToDataUrl(file) {
      return new Promise((resolve) => {
        if (!file) return resolve('');
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result || '');
        reader.onerror = () => resolve('');
        reader.readAsDataURL(file);
      });
    }
    startCamera.addEventListener('click', async () => {
      result.className = 'attendance-result empty';
      result.textContent = 'Abrindo camera...';
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
        video.srcObject = stream;
        video.hidden = false;
        capturePhoto.disabled = false;
        result.textContent = 'Camera aberta. Enquadre o rosto e clique em Capturar foto agora.';
      } catch (error) {
        result.className = 'attendance-result error';
        result.textContent = 'Nao foi possivel abrir a camera ao vivo. Use o botao Tirar foto pelo celular.';
      }
    });
    capturePhoto.addEventListener('click', async () => {
      const width = video.videoWidth || 720;
      const height = video.videoHeight || 720;
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(video, 0, 0, width, height);
      await setFacePhoto(canvas.toDataURL('image/jpeg', 0.88));
      result.className = 'attendance-result ok';
      result.textContent = 'Foto capturada. Agora confira os dados e envie a matricula.';
      if (stream) stream.getTracks().forEach((track) => track.stop());
      video.hidden = true;
      capturePhoto.disabled = true;
    });
    cameraFile.addEventListener('change', async () => {
      const value = await fileToDataUrl(cameraFile.files?.[0]);
      await setFacePhoto(value);
      if (photo) {
        result.className = 'attendance-result ok';
        result.textContent = 'Foto recebida. Agora confira os dados e envie a matricula.';
      }
    });
    enrollmentPlan.addEventListener('change', updateSubmitState);
    updateSubmitState();
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(form).entries());
      if (!photo) {
        result.className = 'attendance-result error';
        result.textContent = 'Tire a foto do aluno antes de enviar o cadastro.';
        return;
      }
      if (data.password !== data.confirmPassword) {
        result.className = 'attendance-result error';
        result.textContent = 'As senhas digitadas nao conferem.';
        return;
      }
      if (!data.planId) {
        result.className = 'attendance-result error';
        result.textContent = 'Escolha o plano desejado antes de enviar.';
        return;
      }
      result.className = 'attendance-result empty';
      result.textContent = 'Enviando matricula...';
      const res = await fetch('/api/matricula', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...data, photo, faceVector })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        result.className = 'attendance-result error';
        if (body.contactUrl) {
          result.innerHTML = '<strong>' + (body.error || 'Cadastro ja existe.') + '</strong><span><a href="' + body.contactUrl + '" target="_blank" rel="noopener">Clique aqui para falar no WhatsApp com a frase: recuperar senha</a></span>';
        } else {
          result.textContent = body.error || 'Nao foi possivel enviar a matricula.';
        }
        return;
      }
      result.className = 'attendance-result ok';
      result.innerHTML = '<strong>Matricula enviada.</strong><span>Seu cadastro aguardara ativacao do administrador apos conferencia dos dados.</span>';
      form.reset();
      setPhoto('');
      faceVector = [];
      updateSubmitState();
    });
  </script>`);
}

function studentAccessPage() {
  return shell("Acesso do aluno", `<main class="login" id="busca">
    <section class="login-panel access-login-panel">
      <p class="eyebrow">Aluno</p>
      <h1>Acesso do aluno</h1>
      <p>Tire a selfie e entre por reconhecimento facial, sem digitar senha, CPF ou nome.</p>
        <form id="faceLoginForm" class="editor-form face-login-form">
          <label>Selfie do aluno<input id="faceLoginPhoto" type="file" accept="image/*" capture="user" required></label>
          <div id="facePreview" class="attendance-preview"><span>Sem foto</span></div>
          <button class="button primary" type="submit">Entrar por reconhecimento facial</button>
        </form>
        <div id="faceLoginResult" class="attendance-result empty">Use uma foto com o rosto centralizado. O sistema procura automaticamente o aluno cadastrado.</div>
        <hr>
        <p>Tambem e possivel buscar o aluno e entrar com senha.</p>
        <div class="search-controls">
          <input id="q" placeholder="Nome completo ou CPF" autocomplete="off">
          <button class="button primary" id="clear">Limpar</button>
        </div>
        <div id="results" class="results"><p class="empty">Digite o nome completo ou CPF.</p></div>
    </section>
  </main>
  <script>
    const q = document.getElementById('q');
    const results = document.getElementById('results');
    const clear = document.getElementById('clear');
    const faceForm = document.getElementById('faceLoginForm');
    const facePhotoInput = document.getElementById('faceLoginPhoto');
    const facePreview = document.getElementById('facePreview');
    const faceResult = document.getElementById('faceLoginResult');
    let facePhoto = '';
    function fileToDataUrl(file) {
      return new Promise((resolve) => {
        if (!file) return resolve('');
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result || '');
        reader.onerror = () => resolve('');
        reader.readAsDataURL(file);
      });
    }
    function loadImage(src) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
      });
    }
    async function imageVector(src) {
      const img = await loadImage(src);
      const size = 32;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      const crop = Math.min(img.naturalWidth || img.width, img.naturalHeight || img.height) * 0.82;
      const sx = ((img.naturalWidth || img.width) - crop) / 2;
      const sy = ((img.naturalHeight || img.height) - crop) / 2;
      ctx.drawImage(img, sx, sy, crop, crop, 0, 0, size, size);
      const pixels = ctx.getImageData(0, 0, size, size).data;
      const values = [];
      for (let i = 0; i < pixels.length; i += 4) values.push((pixels[i] * 0.299) + (pixels[i + 1] * 0.587) + (pixels[i + 2] * 0.114));
      const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
      const variance = values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / values.length;
      const deviation = Math.sqrt(variance) || 1;
      return values.map((value) => (value - mean) / deviation);
    }
    facePhotoInput.addEventListener('change', async () => {
      facePhoto = await fileToDataUrl(facePhotoInput.files?.[0]);
      facePreview.innerHTML = facePhoto ? '<img src="' + facePhoto + '" alt="Selfie">' : '<span>Sem foto</span>';
    });
    faceForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      faceResult.className = 'attendance-result empty';
      faceResult.textContent = 'Comparando rosto com os cadastros ativos...';
      if (!facePhoto) facePhoto = await fileToDataUrl(facePhotoInput.files?.[0]);
      let faceVector = [];
      try {
        faceVector = await imageVector(facePhoto);
      } catch (error) {
        faceResult.className = 'attendance-result error';
        faceResult.textContent = 'Nao foi possivel ler a selfie. Tire outra foto com o rosto centralizado.';
        return;
      }
      const loginRes = await fetch('/api/student/face-login-auto', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ photo: facePhoto, faceVector })
      });
      const login = await loginRes.json().catch(() => ({}));
      if (!loginRes.ok) {
        faceResult.className = 'attendance-result error';
        faceResult.textContent = login.error || 'Acesso negado.';
        return;
      }
      sessionStorage.setItem('fusion-student-face-' + login.slug, login.token);
      faceResult.className = 'attendance-result ok';
      faceResult.innerHTML = '<strong>Acesso liberado.</strong><span>' + login.studentName + ' | Similaridade: ' + login.faceScore + '%</span>';
      location.href = '/aluno/' + login.slug;
    });
    async function run() {
      const value = q.value.trim();
      if (!value) {
        results.innerHTML = '<p class="empty">Digite o nome completo ou CPF.</p>';
        return;
      }
      const data = await fetch('/api/students?search=' + encodeURIComponent(value)).then((r) => r.json());
      results.innerHTML = data.length
        ? data.map((s) => '<a class="result" href="/aluno/' + s.slug + '"><strong>' + s.name + '</strong><span>Abrir</span></a>').join('')
        : '<p class="empty">Nenhum aluno encontrado. Use o nome completo ou CPF cadastrado.</p>';
    }
    q.addEventListener('input', run);
    clear.addEventListener('click', () => { q.value = ''; q.focus(); run(); });
  </script>`);
}

function attendancePage() {
  return shell("Controle de presenca", `<main class="login attendance-page">
    <section class="login-panel attendance-panel">
      <p class="eyebrow">Controle de presenca</p>
      <h1>Entrada por foto facial</h1>
      <p>Digite o nome completo ou CPF cadastrado, tire uma selfie pelo celular e registre a presenca online.</p>
      <form id="attendanceForm" class="editor-form">
        <label>Nome completo ou CPF<input id="studentSearch" name="search" autocomplete="off" required placeholder="Digite o nome completo ou CPF"></label>
        <label>Selfie do aluno<input id="facePhoto" name="facePhoto" type="file" accept="image/*" capture="user" required></label>
        <div id="preview" class="attendance-preview"><span>Sem foto</span></div>
        <button class="button primary" type="submit">Registrar presenca</button>
      </form>
      <div id="attendanceResult" class="attendance-result empty">A presenca sera salva com data, hora e foto.</div>
    </section>
  </main>
  <script>
    const form = document.getElementById('attendanceForm');
    const fileInput = document.getElementById('facePhoto');
    const preview = document.getElementById('preview');
    const result = document.getElementById('attendanceResult');
    let photo = '';
    function fileToDataUrl(file) {
      return new Promise((resolve) => {
        if (!file) return resolve('');
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result || '');
        reader.onerror = () => resolve('');
        reader.readAsDataURL(file);
      });
    }
    fileInput.addEventListener('change', async () => {
      photo = await fileToDataUrl(fileInput.files?.[0]);
      preview.innerHTML = photo ? '<img src="' + photo + '" alt="Selfie">' : '<span>Sem foto</span>';
    });
    function loadImage(src) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
      });
    }
    async function imageVector(src) {
      const img = await loadImage(src);
      const size = 32;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      const crop = Math.min(img.naturalWidth || img.width, img.naturalHeight || img.height) * 0.82;
      const sx = ((img.naturalWidth || img.width) - crop) / 2;
      const sy = ((img.naturalHeight || img.height) - crop) / 2;
      ctx.drawImage(img, sx, sy, crop, crop, 0, 0, size, size);
      const pixels = ctx.getImageData(0, 0, size, size).data;
      const values = [];
      for (let i = 0; i < pixels.length; i += 4) values.push((pixels[i] * 0.299) + (pixels[i + 1] * 0.587) + (pixels[i + 2] * 0.114));
      const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
      const variance = values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / values.length;
      const deviation = Math.sqrt(variance) || 1;
      return values.map((value) => (value - mean) / deviation);
    }
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      result.className = 'attendance-result empty';
      result.textContent = 'Comparando rosto com o cadastro...';
      if (!photo) photo = await fileToDataUrl(fileInput.files?.[0]);
      let faceVector = [];
      try {
        faceVector = await imageVector(photo);
      } catch (error) {
        result.className = 'attendance-result error';
        result.textContent = 'Nao foi possivel ler a selfie. Tire outra foto com o rosto centralizado.';
        return;
      }
      result.textContent = 'Rosto conferido. Registrando presenca...';
      const res = await fetch('/api/attendance/checkin', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ search: document.getElementById('studentSearch').value, photo, faceVector })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        result.className = 'attendance-result error';
        result.textContent = data.error || 'Nao foi possivel registrar.';
        return;
      }
      result.className = 'attendance-result ok';
      result.innerHTML = '<strong>' + data.message + '</strong><span>' + data.studentName + ' | ' + data.time + ' | Similaridade: ' + data.faceScore + '%</span>';
      form.reset();
      photo = '';
      preview.innerHTML = '<span>Sem foto</span>';
    });
  </script>`);
}

function studentPage(slug) {
  return shell("Area do aluno", `<main class="login" id="login">
    <section class="login-panel">
      <p class="eyebrow">Aluno</p>
      <h1>Acesso do aluno</h1>
      <p>Digite a senha para abrir os dados.</p>
      <input id="password" type="password" placeholder="Senha do aluno">
      <button class="button primary" id="enter">Entrar</button>
      <p class="error" id="error"></p>
    </section>
  </main>
  <main class="student-app" id="app" hidden></main>
  <script>
    const slug = ${JSON.stringify(slug)};
    const pass = document.getElementById('password');
    const error = document.getElementById('error');
    const app = document.getElementById('app');
    const sessionKey = 'fusion-student-' + slug;
    const faceSessionKey = 'fusion-student-face-' + slug;
    function text(value) { return value || '-'; }
    function renderAssessment(assessment) {
      if (!assessment) return '<p>Nenhuma avaliaÃ§Ã£o cadastrada.</p>';
      const rows = [
        ['Data', assessment.date], ['Peso', assessment.weight], ['Altura', assessment.height],
        ['IMC', assessment.bmi], ['Peitoral', assessment.chest], ['Cintura', assessment.waist],
        ['Quadril', assessment.hip], ['BraÃ§o', assessment.arm], ['Coxa', assessment.thigh],
        ['Panturrilha', assessment.calf], ['PressÃ£o', assessment.bloodPressure],
        ['FrequÃªncia cardÃ­aca', assessment.heartRate], ['Objetivo', assessment.goal],
        ['RestriÃ§Ãµes', assessment.limitations], ['Anamnese', assessment.anamnesis],
        ['ObservaÃ§Ãµes', assessment.notes]
      ];
      return '<div class="readonly-grid">' + rows.map(([label, value]) => '<div><span>' + label + '</span><strong>' + text(value) + '</strong></div>').join('') + '</div>';
    }
    function renderWorkout(routine) {
      const groups = routine && routine.groups ? routine.groups : [{ name: 'TREINO A', description: routine?.description || '', exercises: routine?.exercises || [] }];
      if (!groups.some((group) => group.exercises && group.exercises.length)) return '<p>Nenhum treino cadastrado.</p>';
      return '<div class="training-groups">' + groups.map((group) => '<section class="training-group"><div class="training-heading"><h3>' + text(group.name) + '</h3><p>' + text(group.description) + '</p></div><div class="training-carousel">' + (group.exercises || []).map((item) => '<article class="training-slide"><img src="' + item.image + '" alt=""><h4>' + item.name + '</h4><p><strong>' + text(item.sets) + '</strong> series | <strong>' + text(item.reps) + '</strong> repetiÃ§Ãµes</p><p>Peso: <strong>' + text(item.weight) + '</strong> | Descanso: <strong>' + text(item.rest) + '</strong></p><p>' + text(item.notes) + '</p></article>').join('') + '</div></section>').join('') + '</div>';
    }
    async function enter() {
      error.textContent = 'Verificando...';
      const res = await fetch('/api/student/' + slug, { headers: { 'x-password': pass.value } });
      if (!res.ok) { sessionStorage.removeItem(sessionKey); error.textContent = 'Senha incorreta.'; return; }
      sessionStorage.setItem(sessionKey, pass.value);
      const s = await res.json();
      renderStudent(s);
    }
    async function enterWithFaceToken(token) {
      error.textContent = 'Verificando reconhecimento facial...';
      const res = await fetch('/api/student/' + slug, { headers: { 'x-face-token': token } });
      if (!res.ok) { sessionStorage.removeItem(faceSessionKey); error.textContent = 'Reconhecimento facial expirado. Acesse novamente pela tela do aluno.'; return; }
      const s = await res.json();
      renderStudent(s);
    }
    function studentAuthHeaders() {
      const headers = { 'content-type': 'application/json' };
      const faceToken = sessionStorage.getItem(faceSessionKey);
      const savedPassword = sessionStorage.getItem(sessionKey) || pass.value;
      if (faceToken) headers['x-face-token'] = faceToken;
      else headers['x-password'] = savedPassword;
      return headers;
    }
    function renderStudent(s) {
      document.getElementById('login').remove();
      app.hidden = false;
      const alert = s.paymentStatus !== 'Em dia' ? ' alert' : '';
      app.innerHTML = '<header class="student-header"><span class="brand"><span class="brand-mark">FCF</span><span>Area do aluno</span></span><div class="student-header-actions"><span class="student-pill">' + s.paymentStatus + '</span><button class="button neutral" id="logoutStudent">Sair</button></div></header>' +
        '<section class="student-hero"><div class="student-photo-wrap">' + (s.photo ? '<img src="' + s.photo + '" alt="Foto do aluno">' : '<span>Sem foto</span>') + '</div><div><p>Bem-vindo</p><h1>' + s.name + '</h1><span>Professor: ' + s.professorName + '</span></div></section>' +
        '<section class="student-summary"><article class="student-card' + alert + '"><span>Vencimento</span><strong>' + s.paymentDue + '</strong><small>' + s.paymentStatus + '</small></article><article class="student-card"><span>Plano</span><strong>' + s.plan + '</strong><small>Matricula ativa</small></article><article class="student-card"><span>Frequencia</span><strong>' + s.frequency + '</strong><small>Ultima entrada: ' + s.lastCheckin + '</small></article></section>' +
        '<nav class="student-tabs"><a href="#treino">Treino</a><a href="#avaliacao">Avaliacao</a><a href="#dados">Dados</a></nav>' +
        '<section class="student-section" id="catraca"><h2>Catraca</h2><div class="student-card"><span>Entrada liberada pelo aluno</span><strong>1 vez por dia</strong><small>A catraca fica livre por 10 segundos.</small><button class="button primary" id="studentOpenTurnstile">Liberar catraca agora</button><p id="studentTurnstileResult" class="empty"></p></div></section>' +
        '<section class="student-section" id="treino"><h2>Treino atual</h2>' + renderWorkout(s.routine) + '</section>' +
        '<section class="student-section" id="avaliacao"><h2>Avaliacao fisica e anamnese</h2>' + renderAssessment(s.assessmentData) + '</section>' +
        '<section class="student-section" id="dados"><h2>Dados do acesso</h2><div class="readonly-grid"><div><span>Matricula</span><strong>' + text(s.registration) + '</strong></div><div><span>CPF</span><strong>' + text(s.cpf) + '</strong></div><div><span>Celular</span><strong>' + text(s.mobile) + '</strong></div></div></section>';
      document.getElementById('logoutStudent').addEventListener('click', () => {
        sessionStorage.removeItem(sessionKey);
        sessionStorage.removeItem(faceSessionKey);
        location.href = '/alunos';
      });
      document.getElementById('studentOpenTurnstile').addEventListener('click', async () => {
        const button = document.getElementById('studentOpenTurnstile');
        const result = document.getElementById('studentTurnstileResult');
        button.disabled = true;
        result.textContent = 'Enviando liberacao para a catraca...';
        const res = await fetch('/api/student/' + slug + '/turnstile/open', {
          method: 'POST',
          headers: studentAuthHeaders(),
          body: JSON.stringify({})
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          result.textContent = data.message || 'Catraca liberada por 10 segundos.';
        } else {
          result.textContent = data.error || 'Nao foi possivel liberar a catraca.';
          button.disabled = false;
        }
      });
    }
    document.getElementById('enter').addEventListener('click', enter);
    pass.addEventListener('keydown', (e) => { if (e.key === 'Enter') enter(); });
    const savedFaceToken = sessionStorage.getItem(faceSessionKey);
    if (savedFaceToken) {
      enterWithFaceToken(savedFaceToken);
    } else {
    const savedPassword = sessionStorage.getItem(sessionKey);
    if (savedPassword) {
      pass.value = savedPassword;
      enter();
    }
    }
  </script>`);
}

function professorsPage(db) {
  const links = db.professors.map((p) => `<a class="result" href="/professor/${p.id}"><strong>${p.name}</strong><span>Abrir</span></a>`).join("");
  return shell("Professores", `<main class="login"><section class="login-panel access-login-panel"><p class="eyebrow">Professor</p><h1>Acesso do professor</h1><p>Escolha seu nome para abrir a area do professor.</p><div class="list">${links || '<p class="empty">Nenhum professor cadastrado.</p>'}</div></section></main>`);
}

function professorPage(id) {
  return shell("Professor", `<main class="login" id="login">
    <section class="login-panel">
      <p class="eyebrow">Professor</p>
      <h1>Area do professor</h1>
      <p>Digite a senha dos professores.</p>
      <input id="password" type="password" placeholder="Senha">
      <button class="button primary" id="enter">Entrar</button>
      <p class="error" id="error"></p>
    </section>
  </main>
  <main class="dashboard" id="app" hidden></main>
  <script>
    const professorId = ${JSON.stringify(id)};
    const pass = document.getElementById('password');
    const error = document.getElementById('error');
    const app = document.getElementById('app');
    const sessionKey = 'fusion-professor-' + professorId;
    let students = [];
    let exercises = [];
    let selected = null;
    async function api(path, opts = {}) {
      opts.headers = { ...(opts.headers || {}), 'x-password': pass.value, 'content-type': 'application/json' };
      return fetch(path, opts);
    }
    async function enter() {
      const res = await api('/api/professor/' + professorId + '/students');
      if (!res.ok) { sessionStorage.removeItem(sessionKey); error.textContent = 'Senha incorreta.'; return; }
      sessionStorage.setItem(sessionKey, pass.value);
      const data = await res.json();
      students = data.students;
      exercises = data.exercises;
      document.getElementById('login').remove();
      app.hidden = false;
      render();
    }
    function selectedStudent() { return students.find((item) => item.id === selected); }
    function render() {
      app.innerHTML = '<header class="topbar"><nav class="nav"><span class="brand"><span class="brand-mark">FCF</span><span>Area do professor</span></span><button class="button neutral" id="logoutProfessor">Sair</button></nav></header>' +
        '<section class="panel hero-panel"><p class="eyebrow dark">Area do professor</p><h1>' + professorId.replace("-", " ") + '</h1><p>Editar avaliaÃ§Ã£o, anamnese, frequÃªncia, vencimento e rotina de treino.</p></section>' +
        '<section class="panel"><h2>Minha senha</h2><form id="professorPasswordForm" class="editor-form payment-form"><label>Nova senha<input name="password" required></label><button class="button primary" type="submit">Alterar minha senha</button></form></section>' +
        '<section class="workspace professor-workspace"><aside class="panel"><h2>Alunos</h2><input class="field" id="filter" placeholder="Buscar aluno"><div id="list" class="list"></div></aside><section class="panel"><h2 id="title">Selecione um aluno</h2><div class="tabs"><button class="tab active" data-tab="dados">Dados</button><button class="tab" data-tab="avaliacao">AvaliaÃ§Ã£o</button><button class="tab" data-tab="treino">Treino</button></div><div id="editor"></div><p id="saved" class="empty"></p></section></section>';
      wireList();
      document.getElementById('logoutProfessor').addEventListener('click', () => {
        sessionStorage.removeItem(sessionKey);
        location.href = '/professor';
      });
      document.getElementById('professorPasswordForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const body = Object.fromEntries(new FormData(e.currentTarget).entries());
        const res = await api('/api/professor/' + professorId + '/password', { method: 'PUT', body: JSON.stringify(body) });
        if (res.ok) { pass.value = body.password; sessionStorage.setItem(sessionKey, body.password); alert('Senha alterada.'); }
      });
      drawEditor('dados');
    }
    function wireList() {
      const list = document.getElementById('list');
      const filter = document.getElementById('filter');
      function drawList() {
        const q = filter.value.toLowerCase();
        list.innerHTML = students.filter((s) => s.name.toLowerCase().includes(q)).map((s) => '<button class="student-btn student-btn-photo' + (selected === s.id ? ' active' : '') + '" data-id="' + s.id + '">' + (s.photo ? '<img src="' + s.photo + '" alt="">' : '<span class="photo-placeholder">Foto</span>') + '<span><strong>' + s.name + '</strong><br><small>' + s.paymentDue + ' - ' + s.paymentStatus + '</small></span></button>').join('') || '<p class="empty">Nenhum aluno.</p>';
      }
      list.addEventListener('click', (e) => {
        const button = e.target.closest('[data-id]');
        if (!button) return;
        selected = button.dataset.id;
        document.getElementById('title').textContent = selectedStudent().name;
        drawList();
        drawEditor('dados');
      });
      filter.addEventListener('input', drawList);
      document.querySelectorAll('.tab').forEach((button) => button.addEventListener('click', () => drawEditor(button.dataset.tab)));
      drawList();
    }
    function setActive(tab) {
      document.querySelectorAll('.tab').forEach((button) => button.classList.toggle('active', button.dataset.tab === tab));
    }
    function drawEditor(tab) {
      setActive(tab);
      const editor = document.getElementById('editor');
      const s = selectedStudent();
      if (!s) { editor.innerHTML = '<p class="empty">Selecione um aluno para editar.</p>'; return; }
      if (tab === 'avaliacao') return drawAssessment(editor, s);
      if (tab === 'treino') return drawWorkout(editor, s);
      editor.innerHTML = '<form id="form" class="editor-form"><label>Vencimento<input name="paymentDue" type="date" value="' + (s.paymentDue || '') + '"></label><label>Status<select name="paymentStatus"><option>Em dia</option><option>Atencao</option><option>Vencido</option></select></label><label>Plano<input name="plan" value="' + (s.plan || '') + '"></label><label>Frequencia<input name="frequency" value="' + (s.frequency || '') + '"></label><label>Ultima entrada<input name="lastCheckin" type="date" value="' + (s.lastCheckin || '') + '"></label><button class="button primary" type="submit">Salvar dados</button></form>';
      editor.querySelector('[name="paymentStatus"]').value = s.paymentStatus || 'Em dia';
      editor.querySelector('form').addEventListener('submit', saveForm);
    }
    function drawAssessment(editor, s) {
      const a = s.assessmentData || {};
      const fields = [
        ['date', 'Data', 'date'], ['weight', 'Peso'], ['height', 'Altura'], ['bmi', 'IMC'],
        ['chest', 'Peitoral'], ['waist', 'Cintura'], ['hip', 'Quadril'], ['arm', 'BraÃ§o'],
        ['thigh', 'Coxa'], ['calf', 'Panturrilha'], ['bloodPressure', 'PressÃ£o arterial'],
        ['heartRate', 'FrequÃªncia cardÃ­aca'], ['goal', 'Objetivo'], ['limitations', 'RestriÃ§Ãµes'],
        ['anamnesis', 'Anamnese completa', 'textarea'], ['notes', 'ObservaÃ§Ãµes', 'textarea']
      ];
      editor.innerHTML = '<form id="form" class="editor-form assessment-grid">' + fields.map(([name, label, type]) => type === 'textarea'
        ? '<label>' + label + '<textarea name="' + name + '" rows="4">' + (a[name] || '') + '</textarea></label>'
        : '<label>' + label + '<input name="' + name + '" type="' + (type || 'text') + '" value="' + (a[name] || '') + '"' + (name === 'weight' ? ' placeholder="Ex: 80,5"' : name === 'height' ? ' placeholder="Ex: 1,70 ou 170"' : name === 'bmi' ? ' placeholder="Calculado automatico"' : '') + '></label>'
      ).join('') + '<button class="button primary" type="submit">Salvar avaliaÃ§Ã£o</button></form>';
      const form = editor.querySelector('form');
      function numberFrom(value) {
        const clean = String(value || '').replace(',', '.').replace(/[^\d.]/g, '');
        return Number(clean);
      }
      function updateBmi() {
        const weightInput = form.querySelector('[name="weight"]');
        const heightInput = form.querySelector('[name="height"]');
        const bmiInput = form.querySelector('[name="bmi"]');
        const weight = numberFrom(weightInput.value);
        let height = numberFrom(heightInput.value);
        if (height > 3) height = height / 100;
        if (weight > 0 && height > 0) bmiInput.value = (weight / (height * height)).toFixed(2).replace('.', ',');
      }
      form.querySelector('[name="weight"]').addEventListener('input', updateBmi);
      form.querySelector('[name="height"]').addEventListener('input', updateBmi);
      form.addEventListener('submit', (e) => { updateBmi(); saveAssessment(e); });
      updateBmi();
    }
    function drawWorkout(editor, s) {
      const routine = s.routine || { groups: [] };
      if (!routine.groups) routine.groups = [{ name: 'TREINO A', description: routine.description || '', exercises: routine.exercises || [] }];
      if (!routine.groups.length) routine.groups.push({ name: 'TREINO A', description: '', exercises: [] });
      let activeGroup = 0;
      let openRoutineGroups = new Set();
      const muscleGroups = Array.from(new Set(exercises.map((ex) => ex.group || 'Outros'))).sort();
      editor.innerHTML = '<div class="routine-builder"><div class="group-tools"><label>Treino<select id="groupSelect"></select></label><label>Nome do treino<input id="groupName" placeholder="TREINO A"></label><label>Descricao<input id="groupDescription" placeholder="TREINO SEGUNDA E QUINTA-FEIRA"></label><button class="button neutral" id="addGroup">Novo treino</button></div><form id="exerciseForm" class="editor-form professor-add-form"><label>Grupo muscular<select id="muscleGroupSelect">' + muscleGroups.map((group) => '<option value="' + group + '">' + group + '</option>').join('') + '</select></label><label>Exercicio<select name="exerciseId"></select></label><label>Series<input name="sets" placeholder="3"></label><label>Repeticoes<input name="reps" placeholder="12"></label><label>Peso<input name="weight" placeholder="20 kg"></label><label>Descanso<input name="rest" placeholder="60s"></label><label>Anotacoes<textarea name="notes" rows="2"></textarea></label><button class="button primary professor-add-main" type="submit">Adicionar ao treino selecionado</button></form><div id="routineList" class="training-groups"></div><button class="button primary" id="saveRoutine">Salvar treino</button></div>';
      function syncGroupFields() {
        const group = routine.groups[activeGroup];
        document.getElementById('groupName').value = group.name || '';
        document.getElementById('groupDescription').value = group.description || '';
        document.getElementById('groupSelect').innerHTML = routine.groups.map((group, index) => '<option value="' + index + '"' + (index === activeGroup ? ' selected' : '') + '>' + (group.name || ('TREINO ' + (index + 1))) + '</option>').join('');
      }
      function fieldValue(value) {
        return String(value || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
      }
      function updateExerciseOptions() {
        const selectedGroup = document.getElementById('muscleGroupSelect').value;
        const options = exercises.filter((ex) => (ex.group || 'Outros') === selectedGroup);
        editor.querySelector('[name="exerciseId"]').innerHTML = options.map((ex) => '<option value="' + ex.id + '">' + ex.name + '</option>').join('');
      }
      function drawRoutine() {
        syncGroupFields();
        document.getElementById('routineList').innerHTML = routine.groups.map((group, groupIndex) => '<section class="training-group compact-training"><button class="training-toggle" data-toggle-routine-group="' + groupIndex + '"><span>' + (group.name || '-') + '</span><small>' + ((group.exercises || []).length) + ' exercicios</small></button><div class="training-body"' + (openRoutineGroups.has(groupIndex) ? '' : ' hidden') + '><div class="training-heading"><h3>' + (group.name || '-') + '</h3><p>' + (group.description || '') + '</p></div><div class="routine-edit-table">' + (group.exercises || []).map((item, index) => '<div class="routine-edit-row"><strong>' + item.name + '</strong><input aria-label="Series" data-edit-field="sets" data-group="' + groupIndex + '" data-index="' + index + '" value="' + fieldValue(item.sets) + '" placeholder="Series"><input aria-label="Repeticoes" data-edit-field="reps" data-group="' + groupIndex + '" data-index="' + index + '" value="' + fieldValue(item.reps) + '" placeholder="Reps"><input aria-label="Peso" data-edit-field="weight" data-group="' + groupIndex + '" data-index="' + index + '" value="' + fieldValue(item.weight) + '" placeholder="Peso"><input aria-label="Descanso" data-edit-field="rest" data-group="' + groupIndex + '" data-index="' + index + '" value="' + fieldValue(item.rest) + '" placeholder="Descanso"><textarea aria-label="Anotacoes" data-edit-field="notes" data-group="' + groupIndex + '" data-index="' + index + '" rows="1" placeholder="Anotacoes">' + fieldValue(item.notes) + '</textarea><button class="button neutral" data-group="' + groupIndex + '" data-remove="' + index + '">Remover</button></div>').join('') + '</div></div></section>').join('') || '<p class="empty">Nenhum exercício no treino.</p>';
      }
      function addExerciseFromId(id) {
        const form = editor.querySelector('#exerciseForm');
        const ex = exercises.find((item) => item.id === id);
        if (!ex) return;
        routine.groups[activeGroup].exercises ||= [];
        routine.groups[activeGroup].exercises.push({
          exerciseId: ex.id,
          name: ex.name,
          image: ex.image,
          sets: form.sets.value || form.sets.placeholder || '3',
          reps: form.reps.value || form.reps.placeholder || '12',
          weight: form.weight.value || form.weight.placeholder || '',
          rest: form.rest.value || form.rest.placeholder || '60s',
          notes: form.notes.value || ''
        });
        openRoutineGroups.add(activeGroup);
        drawRoutine();
        const saved = document.getElementById('saved');
        saved.textContent = ex.name + ' adicionado ao ' + (routine.groups[activeGroup].name || 'treino');
        setTimeout(() => { if (saved.textContent.includes(ex.name)) saved.textContent = ''; }, 2200);
      }
      document.getElementById('muscleGroupSelect').addEventListener('change', updateExerciseOptions);
      editor.querySelector('#exerciseForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const ex = exercises.find((item) => item.id === form.exerciseId.value);
        routine.groups[activeGroup].exercises ||= [];
        routine.groups[activeGroup].exercises.push({ exerciseId: ex.id, name: ex.name, image: ex.image, sets: form.sets.value, reps: form.reps.value, weight: form.weight.value, rest: form.rest.value, notes: form.notes.value });
        openRoutineGroups.add(activeGroup);
        const selectedMuscleGroup = document.getElementById('muscleGroupSelect').value;
        const selectedExercise = form.exerciseId.value;
        form.sets.value = '';
        form.reps.value = '';
        form.weight.value = '';
        form.rest.value = '';
        form.notes.value = '';
        document.getElementById('muscleGroupSelect').value = selectedMuscleGroup;
        updateExerciseOptions();
        form.exerciseId.value = selectedExercise;
        drawRoutine();
      });
      editor.querySelector('#routineList').addEventListener('click', (e) => {
        const toggle = e.target.closest('[data-toggle-routine-group]');
        if (toggle) {
          e.preventDefault();
          const index = Number(toggle.dataset.toggleRoutineGroup);
          if (openRoutineGroups.has(index)) openRoutineGroups.delete(index);
          else openRoutineGroups.add(index);
          drawRoutine();
          return;
        }
        const button = e.target.closest('[data-remove]');
        if (!button) return;
        routine.groups[Number(button.dataset.group)].exercises.splice(Number(button.dataset.remove), 1);
        drawRoutine();
      });
      editor.querySelector('#routineList').addEventListener('input', (e) => {
        const field = e.target.closest('[data-edit-field]');
        if (!field) return;
        const group = routine.groups[Number(field.dataset.group)];
        const item = group?.exercises?.[Number(field.dataset.index)];
        if (!item) return;
        item[field.dataset.editField] = field.value;
      });
      editor.querySelector('#groupSelect').addEventListener('change', (e) => { activeGroup = Number(e.target.value); drawRoutine(); });
      editor.querySelector('#groupName').addEventListener('input', (e) => { routine.groups[activeGroup].name = e.target.value; syncGroupFields(); });
      editor.querySelector('#groupDescription').addEventListener('input', (e) => { routine.groups[activeGroup].description = e.target.value; });
      editor.querySelector('#addGroup').addEventListener('click', (e) => {
        e.preventDefault();
        routine.groups.push({ name: 'TREINO ' + String.fromCharCode(65 + routine.groups.length), description: '', exercises: [] });
        activeGroup = routine.groups.length - 1;
        drawRoutine();
      });
      editor.querySelector('#saveRoutine').addEventListener('click', async () => {
        await saveStudent({ routine });
      });
      updateExerciseOptions();
      drawRoutine();
    }
    async function saveStudent(patch) {
      const res = await api('/api/student/' + selected, { method: 'PUT', body: JSON.stringify(patch) });
      if (res.ok) {
        const updated = await res.json();
        students = students.map((item) => item.id === updated.id ? updated : item);
        document.getElementById('saved').textContent = 'Salvo no servidor online.';
      }
    }
    async function saveForm(e) {
      e.preventDefault();
      const body = {};
      for (const field of e.currentTarget.elements) if (field.name) body[field.name] = field.value;
      await saveStudent(body);
    }
    async function saveAssessment(e) {
      e.preventDefault();
      const assessmentData = {};
      for (const field of e.currentTarget.elements) if (field.name) assessmentData[field.name] = field.value;
      await saveStudent({ assessmentData });
    }
    document.getElementById('enter').addEventListener('click', enter);
    pass.addEventListener('keydown', (e) => { if (e.key === 'Enter') enter(); });
    const savedPassword = sessionStorage.getItem(sessionKey);
    if (savedPassword) {
      pass.value = savedPassword;
      enter();
    }
  </script>`);
}

function adminPage() {
  return shell("Administrador", `<main class="login" id="login">
    <section class="login-panel">
      <p class="eyebrow">Administrador</p>
      <h1>Cadastros e direcionamento</h1>
      <p>Digite usuario e senha do administrador.</p>
      <input id="username" type="text" placeholder="Usuario" value="admin">
      <input id="password" type="password" placeholder="Senha">
      <button class="button primary" id="enter">Entrar</button>
      <p class="error" id="error"></p>
      <p><a href="/">Voltar</a></p>
    </section>
  </main>
  <main class="admin-app" id="app" hidden></main>
  <script>
    const username = document.getElementById('username');
    const pass = document.getElementById('password');
    const error = document.getElementById('error');
    const app = document.getElementById('app');
    let data;
    async function api(path, opts = {}) {
      opts.headers = { ...(opts.headers || {}), 'x-admin-user': username.value, 'x-password': pass.value, 'content-type': 'application/json' };
      return fetch(path, opts);
    }
    async function refresh() { data = await api('/api/admin').then((r) => r.json()); }
    async function enter() {
      const res = await api('/api/admin');
      if (!res.ok) { error.textContent = 'Senha incorreta.'; return; }
      data = await res.json();
      document.getElementById('login').remove();
      app.hidden = false;
      render();
    }
    function professorOptions(selected) {
      return data.professors.map((p) => '<option value="' + p.id + '"' + (p.id === selected ? ' selected' : '') + '>' + p.name + '</option>').join('');
    }
    function planOptions(selected) {
      return data.plans.map((p) => '<option value="' + p.id + '"' + (p.id === selected ? ' selected' : '') + '>' + p.name + ' - R$ ' + Number(p.price || 0).toFixed(2) + '</option>').join('');
    }
    function productOptions(selected) {
      return (data.products || []).map((p) => '<option value="' + p.id + '"' + (p.id === selected ? ' selected' : '') + '>' + p.name + ' - R$ ' + Number(p.price || 0).toFixed(2) + '</option>').join('');
    }
    function money(value) { return 'R$ ' + Number(value || 0).toFixed(2); }
    function renderCashList() {
      const rows = (data.payments || []).slice().reverse().slice(0, 80).map((p) => {
        const origin = p.source === 'produto' ? 'Produto' : p.source === 'matricula' ? 'Matricula' : 'Mensalidade';
        const detail = p.source === 'produto' ? (p.productName || '-') + ' | Qtde: ' + (p.quantity || 1) : (p.studentName || '-') + ' | ' + (p.planName || '-') + (p.nextDue ? ' | Proximo bloqueio: ' + p.nextDue : '');
        return '<div class="admin-row cash-row"><div><strong>' + origin + '</strong><span>' + detail + ' | ' + (p.method || '-') + ' | ' + new Date(p.paidAt).toLocaleString('pt-BR') + '</span></div><div><strong>' + money(p.amount) + '</strong><button class="button danger" data-delete-payment="' + p.id + '">Excluir</button></div></div>';
      }).join('');
      return rows || '<p class="empty">Nenhuma entrada no caixa.</p>';
    }
    function renderAttendanceList() {
      const rows = (data.attendance || []).slice().reverse().slice(0, 80).map((entry) => '<div class="admin-row attendance-row"><div class="admin-student-line">' + (entry.photo ? '<img src="' + entry.photo + '" alt="">' : '<span class="photo-placeholder">Foto</span>') + '<div><strong>' + entry.studentName + '</strong><span>' + new Date(entry.createdAt).toLocaleString('pt-BR') + ' | ' + (entry.status || 'Registrado') + (entry.faceScore ? ' | Similaridade: ' + entry.faceScore + '%' : '') + '</span></div></div><div><strong>' + (entry.method || 'foto facial') + '</strong></div></div>').join('');
      return rows || '<p class="empty">Nenhuma presenca registrada.</p>';
    }
    function renderTurnstileList() {
      const rows = (data.turnstileCommands || []).slice().reverse().slice(0, 60).map((item) => '<div class="admin-row"><div><strong>' + (item.studentName || '-') + '</strong><span>' + (item.status || '-') + ' | ' + new Date(item.createdAt).toLocaleString('pt-BR') + (item.message ? ' | ' + item.message : '') + '</span></div><div><strong>' + (item.type || 'open') + '</strong></div></div>').join('');
      return rows || '<p class="empty">Nenhum comando enviado para a catraca.</p>';
    }
    function studentCadastroForm() {
      return '<form id="studentForm" class="editor-form cadastro-form">' +
        '<fieldset><legend>Dados cadastrais</legend><label>MatrÃ­cula<input name="registration" placeholder="00392"></label><label>Nome<input name="name" required></label><label>Foto do aluno<input name="photoFile" type="file" accept="image/*"></label><label>Endereco<input name="address"></label><label>Bairro<input name="district"></label><label>CEP<input name="zipCode"></label><label>Cidade<input name="city" value="MACEIO"></label><label>UF<input name="state" value="AL"></label><label>Telefone<input name="phone"></label><label>Celular<input name="mobile"></label><label>Sexo<select name="gender"><option>Masculino</option><option>Feminino</option><option>Outro</option></select></label><label>CPF<input name="cpf" placeholder="000.000.000-00" required></label><label>Identidade<input name="identity"></label><label>UF identidade<input name="identityState"></label><label>E-mail<input name="email" type="email"></label><label>Data nascimento<input name="birthDate" inputmode="numeric" placeholder="dd/mm/aaaa" maxlength="10"></label><label>Idade<input name="age" type="number" readonly></label><label>SituaÃ§Ã£o<input name="situation" value="Ativo"></label><label>DÃ©bito<input name="debit" placeholder="R$ 0,00"></label><label>ObservaÃ§Ãµes<textarea name="registrationNotes" rows="4"></textarea></label></fieldset>' +
        '<fieldset><legend>Adicionais</legend><label>Validade exame mÃ©dico<input name="medicalExamValidUntil" type="date"></label><label>Validade avaliaÃ§Ã£o fÃ­sica<input name="physicalAssessmentValidUntil" type="date"></label><label>Objetivo<input name="objective"></label><label>ProfissÃ£o<input name="profession"></label><label>Estado civil<select name="maritalStatus"><option></option><option>Solteiro(a)</option><option>Casado(a)</option><option>Divorciado(a)</option><option>ViÃºvo(a)</option></select></label><label>Empresa<input name="company"></label><label>Telefone da empresa<input name="companyPhone"></label><label>Como nos conheceu?<input name="referralSource"></label><label>Nome do pai<input name="fatherName"></label><label>Telefone pai<input name="fatherPhone"></label><label>Nome da mÃ£e<input name="motherName"></label><label>Telefone mÃ£e<input name="motherPhone"></label><label>Mais informaÃ§Ãµes<textarea name="extraInfo" rows="4"></textarea></label></fieldset>' +
        '<fieldset><legend>HorÃ¡rio</legend><label class="checkline"><input name="restrictedSchedule" type="checkbox" value="sim"> Restringir acesso conforme horÃ¡rio</label><label>Dia da semana<select name="scheduleDay"><option></option><option>Segunda</option><option>TerÃ§a</option><option>Quarta</option><option>Quinta</option><option>Sexta</option><option>SÃ¡bado</option><option>Domingo</option></select></label><label>Entrada<input name="scheduleEntry" type="time"></label><label>SaÃ­da<input name="scheduleExit" type="time"></label><label>Local<input name="schedulePlace"></label><label>Turma<input name="scheduleClass"></label><label class="checkline"><input name="limitDailyAccess" type="checkbox" value="sim"> Restringir acessos por dia</label><label>Acessos por dia<input name="accessesPerDay" type="number"></label><label class="checkline"><input name="limitWeeklyAccess" type="checkbox" value="sim"> Restringir acessos por semana</label><label>Acessos por semana<input name="accessesPerWeek" type="number"></label><label class="checkline"><input name="reentryControl" type="checkbox" value="sim"> Controle de reentrada</label><label>Minutos reentrada<input name="reentryMinutes" type="number"></label><label>Segundos reentrada<input name="reentrySeconds" type="number"></label></fieldset>' +
        '<fieldset><legend>Acesso</legend><label>CartÃ£o de acesso?<select name="hasAccessCard"><option>NÃ£o</option><option>Sim</option></select></label><label>NÂº do cartÃ£o<input name="accessCardNumber"></label><label>Senha individual do aluno<input name="accessPassword" required></label><label>Confirmar senha<input name="confirmAccessPassword" required></label><label>Status digital<input name="fingerprintStatus" placeholder="NÃ£o capturada"></label></fieldset>' +
        '<fieldset><legend>Plano e professor</legend><label>Professor<select name="professorId">' + professorOptions(data.professors[0]?.id) + '</select></label><label>Plano<select name="planId">' + planOptions(data.plans[0]?.id) + '</select></label><label>Vencimento<input name="paymentDue" type="date"></label></fieldset>' +
        '<button class="button primary" type="submit">Cadastrar aluno</button></form>';
    }
    function professorCadastroForm(professor = null) {
      const p = professor || {};
      function safe(value) { return String(value || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
      return '<form id="professorForm" class="editor-form cadastro-form">' +
        '<fieldset><legend>Dados cadastrais</legend><label>Nome completo<input name="name" required value="' + safe(p.name) + '"></label><label>Foto atual<div class="student-photo-edit">' + (p.photo ? '<img src="' + safe(p.photo) + '" alt="">' : '<span>Sem foto</span>') + '</div><input name="photoFile" type="file" accept="image/*"></label><label>Senha de acesso<input name="password" required value="' + safe(p.password) + '"></label><label>CPF<input name="cpf" value="' + safe(p.cpf) + '"></label><label>Identidade<input name="identity" value="' + safe(p.identity) + '"></label><label>E-mail<input name="email" type="email" value="' + safe(p.email) + '"></label><label>Telefone<input name="phone" value="' + safe(p.phone) + '"></label><label>Celular<input name="mobile" value="' + safe(p.mobile) + '"></label><label>Data nascimento<input name="birthDate" inputmode="numeric" placeholder="dd/mm/aaaa" maxlength="10" value="' + safe(p.birthDate) + '"></label></fieldset>' +
        '<fieldset><legend>Endereco e CREF</legend><label>Endereco<input name="address" value="' + safe(p.address) + '"></label><label>Bairro<input name="district" value="' + safe(p.district) + '"></label><label>CEP<input name="zipCode" value="' + safe(p.zipCode) + '"></label><label>Cidade<input name="city" value="' + safe(p.city) + '"></label><label>UF<input name="state" value="' + safe(p.state || 'AL') + '"></label><label>Cadastro do CREF<input name="cref" value="' + safe(p.cref) + '"></label><label>UF do CREF<input name="crefState" value="' + safe(p.crefState || 'AL') + '"></label><label>Observacoes<textarea name="notes" rows="4">' + safe(p.notes) + '</textarea></label></fieldset>' +
        '<button class="button primary" type="submit">' + (p.id ? 'Salvar alteracoes do professor' : 'Cadastrar professor') + '</button>' +
        (p.id ? '<button class="button neutral" type="button" data-popup-block-professor="' + p.id + '">' + (p.blocked ? 'Desbloquear professor' : 'Bloquear professor') + '</button><button class="button danger" type="button" data-popup-delete-professor="' + p.id + '">Excluir professor</button>' : '') +
        '</form>';
    }
    function renderFinanceSummary() {
      const totals = data.paymentTotals || {};
      return '<div class="stats"><article class="stat"><span>Total recebido</span><strong>' + money(totals.total) + '</strong><small>Todos os pagamentos</small></article><article class="stat"><span>Dinheiro</span><strong>' + money(totals.dinheiro) + '</strong><small>Entrada registrada</small></article><article class="stat"><span>Pix</span><strong>' + money(totals.pix) + '</strong><small>Entrada registrada</small></article><article class="stat"><span>Cartao debito</span><strong>' + money(totals.debito) + '</strong><small>Entrada registrada</small></article><article class="stat"><span>Cartao credito</span><strong>' + money(totals.credito) + '</strong><small>Entrada registrada</small></article></div>';
    }
    function render() {
      app.innerHTML = '<header class="admin-top"><a class="brand" href="/"><span class="brand-mark">FCF</span><span>Painel da academia</span></a><div class="admin-header-actions"><div class="admin-status"><strong>' + data.students.length + '</strong><span>alunos cadastrados</span></div><button class="button neutral" id="logoutAdmin">Sair</button></div></header>' +
        '<div id="toast" class="toast" hidden></div>' +
        '<section class="admin-hero"><div><p class="eyebrow dark">Area administrativa</p><h1>Gestao da academia</h1><p>Cadastros, acessos, planos, pagamentos e bloqueios em um painel separado da area do aluno.</p></div><button class="button primary" id="openNewStudent">Novo cadastro</button></section>' +
        '<nav class="module-bar"><a href="#alunos">Alunos</a><a href="#caixa">Caixa</a><a href="#usuarios">Usuarios</a><a href="#presencas">Presencas</a><a href="#catraca">Catraca</a><a href="#acessos">Acessos</a><a href="#relatorios">Relatorios</a></nav>' +
        '<section class="admin-metrics">' + renderFinanceSummary() + '</section>' +
        '<section class="workspace admin-workspace"><section class="panel admin-module" id="alunos"><h2>Alunos</h2><input id="q" class="field compact-search" placeholder="Buscar aluno"><div class="student-status-columns"><div><h3>Aguardando ativacao</h3><div id="pendingRows" class="admin-list compact-list name-only-list"></div></div><div><h3>Ativos</h3><div id="activeRows" class="admin-list compact-list name-only-list"></div></div><div><h3>Inativos</h3><div id="inactiveRows" class="admin-list compact-list name-only-list"></div></div><div><h3>Excluidos</h3><div id="deletedRows" class="admin-list compact-list name-only-list"></div></div></div></section><section class="panel admin-module" id="usuarios"><h2>Usuarios e planos</h2><button class="button primary" id="openNewProfessor">Cadastrar professor</button><hr><form id="adminForm" class="editor-form"><label>Nome do admin<input name="name" required></label><label>Usuario<input name="username" required></label><label>Senha<input name="password" required></label><button class="button primary" type="submit">Criar novo admin</button></form><hr><form id="changePasswordForm" class="editor-form"><label>Nova senha deste admin<input name="password" required></label><button class="button primary" type="submit">Alterar minha senha</button></form><hr><form id="planForm" class="editor-form"><label>Nome do plano<input name="name" required></label><label>Tipo<select name="type"><option value="mensal">Mensal</option><option value="prepago">Pre-pago</option><option value="trimestral">Trimestral</option><option value="semestral">Semestral</option><option value="diarista">Diarista</option><option value="anual">Anual</option></select></label><label>Valor<input name="price" type="number" step="0.01" required></label><button class="button primary" type="submit">Cadastrar plano</button></form><div id="planRows" class="admin-list"></div></section></section>' +
        '<section class="panel admin-module" id="caixa"><h2>Caixa</h2><div class="cash-grid"><form id="paymentForm" class="editor-form"><h3>Mensalidade ou matricula</h3><label>Origem<select name="source"><option value="mensalidade">Mensalidade</option><option value="matricula">Matricula</option></select></label><label>Aluno<select name="studentId">' + data.students.map((s) => '<option value="' + s.id + '">' + s.name + '</option>').join('') + '</select></label><label>Plano<select name="planId">' + planOptions(data.plans[0]?.id) + '</select></label><label>Valor pago<input name="amount" type="number" step="0.01" required></label><label>Forma de pagamento<select name="method"><option value="dinheiro">Dinheiro</option><option value="pix">Pix</option><option value="debito">Cartao de debito</option><option value="credito">Cartao de credito</option></select></label><label>Mes pago<input name="paidMonth" type="month"></label><label>Proximo vencimento automatico<input name="nextDue" type="date" readonly></label><button class="button primary" type="submit">Lancar pagamento</button></form><form id="productSaleForm" class="editor-form"><h3>Venda de produto</h3><label>Produto<select name="productId">' + productOptions(data.products?.[0]?.id) + '</select></label><label>Quantidade<input name="quantity" type="number" min="1" value="1"></label><label>Valor total<input name="amount" type="number" step="0.01" required></label><label>Forma de pagamento<select name="method"><option value="dinheiro">Dinheiro</option><option value="pix">Pix</option><option value="debito">Cartao de debito</option><option value="credito">Cartao de credito</option></select></label><button class="button primary" type="submit">Lancar venda</button></form><form id="productForm" class="editor-form"><h3>Cadastrar produto</h3><label>Nome do produto<input name="name" required></label><label>Valor<input name="price" type="number" step="0.01" required></label><label>Estoque<input name="stock" type="number" value="0"></label><button class="button primary" type="submit">Cadastrar produto</button></form></div><div id="productRows" class="admin-list"></div><h3>Lista do caixa</h3><div id="cashRows" class="admin-list">' + renderCashList() + '</div></section>' +
        '<section class="panel admin-module" id="presencas"><h2>Presencas por foto facial</h2><p class="empty">Abra /presenca no celular do aluno conectado ao Wi-Fi para registrar entrada.</p><div id="attendanceRows" class="admin-list">' + renderAttendanceList() + '</div></section>' +
        '<section class="panel admin-module" id="catraca"><h2>Catraca Henry 7x</h2><div class="readonly-grid"><div><span>Equipamento</span><strong>' + (data.turnstile?.name || 'Henry 7x') + '</strong></div><div><span>IP / Porta</span><strong>' + (data.turnstile?.ip || '10.0.0.236') + ':' + (data.turnstile?.port || 3000) + '</strong></div><div><span>Token do conector</span><strong>' + (data.turnstile?.connectorToken || '-') + '</strong></div></div><p class="empty">O conector local deve ficar aberto no computador da academia para receber estes comandos e liberar a catraca.</p><div id="turnstileRows" class="admin-list">' + renderTurnstileList() + '</div></section>' +
        '<section class="panel admin-module" id="acessos"><h2>Professores e admins</h2><div id="professorRows" class="admin-list"></div><div id="adminRows" class="admin-list"></div></section>' +
        '<section class="panel admin-module report-preview" id="relatorios"><h2>Relatorios e proximos modulos</h2><div class="module-grid"><article>Controle de turmas</article><article>Caixa e vendas</article><article>Estoque</article><article>Check-in</article><article>Contratos</article><article>WhatsApp</article></div></section>' +
        '<aside id="studentDrawer" class="side-drawer" aria-hidden="true"><div class="drawer-head"><h2 id="drawerTitle">Editar cadastro</h2><button class="button neutral" id="closeDrawer">Fechar</button></div><div id="editStudentPanel"></div></aside><div id="drawerBackdrop" class="drawer-backdrop" hidden></div>' +
        '<div id="paymentBackdrop" class="drawer-backdrop" hidden></div><section id="paymentPopup" class="payment-popup" aria-hidden="true"><div class="drawer-head"><h2>Confirmar pagamento</h2><button class="button neutral" id="closePaymentPopup">Fechar</button></div><form id="paymentPopupForm" class="editor-form"><p id="paymentPopupStudent" class="payment-popup-student"></p><input name="source" type="hidden" value="matricula"><input name="studentId" type="hidden"><label>Plano<select name="planId">' + planOptions(data.plans[0]?.id) + '</select></label><label>Valor pago<input name="amount" type="number" step="0.01" required></label><label>Forma de pagamento<select name="method"><option value="dinheiro">Dinheiro</option><option value="pix">Pix</option><option value="debito">Cartao de debito</option><option value="credito">Cartao de credito</option></select></label><label>Mes pago<input name="paidMonth" type="month"></label><label>Proximo vencimento automatico<input name="nextDue" type="date" readonly></label><button class="button primary" type="submit">Confirmar pagamento e ativar</button></form></section>';
      wire();
    }
    function wire() {
      const drawer = document.getElementById('studentDrawer');
      const backdrop = document.getElementById('drawerBackdrop');
      const toast = document.getElementById('toast');
      document.getElementById('logoutAdmin').addEventListener('click', () => {
        pass.value = '';
        location.href = '/admin';
      });
      function showToast(message) {
        toast.textContent = message;
        toast.hidden = false;
        setTimeout(() => { toast.hidden = true; }, 3200);
      }
      function openDrawer(title) {
        document.getElementById('drawerTitle').textContent = title;
        drawer.classList.add('open');
        drawer.setAttribute('aria-hidden', 'false');
        backdrop.hidden = false;
      }
      function closeDrawer() {
        drawer.classList.remove('open');
        drawer.setAttribute('aria-hidden', 'true');
        backdrop.hidden = true;
      }
      const paymentPopup = document.getElementById('paymentPopup');
      const paymentBackdrop = document.getElementById('paymentBackdrop');
      const paymentPopupForm = document.getElementById('paymentPopupForm');
      function closePaymentPopup() {
        paymentPopup.classList.remove('open');
        paymentPopup.setAttribute('aria-hidden', 'true');
        paymentBackdrop.hidden = true;
      }
      function planById(id) { return data.plans.find((item) => item.id === id); }
      function monthsForPlanType(type) {
        return type === 'trimestral' ? 3 : type === 'semestral' ? 6 : type === 'anual' ? 12 : type === 'diarista' ? 0 : 1;
      }
      function nextDueFromToday(plan) {
        const date = new Date();
        if (plan?.type === 'diarista') date.setDate(date.getDate() + 1);
        else date.setMonth(date.getMonth() + monthsForPlanType(plan?.type));
        return date.toISOString().slice(0, 10);
      }
      function fillPaymentPopup(studentId, source = 'matricula') {
        const student = data.students.find((item) => item.id === studentId);
        if (!student) return;
        const planId = student.planId || data.plans[0]?.id || '';
        const plan = planById(planId);
        paymentPopupForm.source.value = source;
        paymentPopupForm.studentId.value = student.id;
        paymentPopupForm.planId.value = planId;
        paymentPopupForm.amount.value = plan ? Number(plan.price || 0).toFixed(2) : '';
        paymentPopupForm.method.value = 'pix';
        paymentPopupForm.paidMonth.value = new Date().toISOString().slice(0, 7);
        paymentPopupForm.nextDue.value = nextDueFromToday(plan);
        document.getElementById('paymentPopupStudent').innerHTML = '<strong>' + safe(student.name) + '</strong><span>' + (plan ? safe(plan.name) + ' | ' + money(plan.price) : 'Plano nao informado') + '</span>';
      }
      function openPaymentPopup(studentId, source = 'matricula') {
        fillPaymentPopup(studentId, source);
        paymentPopup.classList.add('open');
        paymentPopup.setAttribute('aria-hidden', 'false');
        paymentBackdrop.hidden = false;
      }
      function fileToDataUrl(file) {
        return new Promise((resolve) => {
          if (!file) return resolve('');
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result || '');
          reader.onerror = () => resolve('');
          reader.readAsDataURL(file);
        });
      }
      async function formWithPhoto(form) {
        const body = Object.fromEntries(new FormData(form).entries());
        const file = form.querySelector('[name="photoFile"]')?.files?.[0];
        const photo = await fileToDataUrl(file);
        if (photo) {
          body.photo = photo;
          body.faceVector = await imageVector(photo).catch(() => []);
        }
        return body;
      }
      function loadImage(src) {
        return new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = src;
        });
      }
      async function imageVector(src) {
        const img = await loadImage(src);
        const size = 32;
        const vectorCanvas = document.createElement('canvas');
        vectorCanvas.width = size;
        vectorCanvas.height = size;
        const ctx = vectorCanvas.getContext('2d');
        const crop = Math.min(img.naturalWidth || img.width, img.naturalHeight || img.height) * 0.82;
        const sx = ((img.naturalWidth || img.width) - crop) / 2;
        const sy = ((img.naturalHeight || img.height) - crop) / 2;
        ctx.drawImage(img, sx, sy, crop, crop, 0, 0, size, size);
        const pixels = ctx.getImageData(0, 0, size, size).data;
        const values = [];
        for (let i = 0; i < pixels.length; i += 4) values.push((pixels[i] * 0.299) + (pixels[i + 1] * 0.587) + (pixels[i + 2] * 0.114));
        const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
        const variance = values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / values.length;
        const deviation = Math.sqrt(variance) || 1;
        return values.map((value) => Number(((value - mean) / deviation).toFixed(4)));
      }
      function calculateAge(value) {
        const parts = String(value || '').split('/');
        if (parts.length !== 3) return '';
        const day = Number(parts[0]);
        const month = Number(parts[1]);
        const year = Number(parts[2]);
        if (!day || !month || !year || year < 1900) return '';
        const birth = new Date(year, month - 1, day);
        if (birth.getDate() !== day || birth.getMonth() !== month - 1 || birth.getFullYear() !== year) return '';
        const today = new Date();
        let age = today.getFullYear() - year;
        const birthdayThisYear = new Date(today.getFullYear(), month - 1, day);
        if (today < birthdayThisYear) age -= 1;
        return age >= 0 && age < 130 ? String(age) : '';
      }
      function bindBirthDateAge(form) {
        const birthDate = form?.querySelector('[name="birthDate"]');
        const age = form?.querySelector('[name="age"]');
        if (!birthDate || !age) return;
        const sync = () => {
          let value = birthDate.value.replace(/\D/g, '').slice(0, 8);
          if (value.length > 4) value = value.replace(/(\d{2})(\d{2})(\d{1,4})/, '$1/$2/$3');
          else if (value.length > 2) value = value.replace(/(\d{2})(\d{1,2})/, '$1/$2');
          birthDate.value = value;
          age.value = calculateAge(value);
        };
        birthDate.setAttribute('maxlength', '10');
        birthDate.setAttribute('placeholder', 'dd/mm/aaaa');
        birthDate.addEventListener('input', sync);
        birthDate.addEventListener('keyup', sync);
        birthDate.addEventListener('change', sync);
        birthDate.addEventListener('blur', sync);
        birthDate.addEventListener('paste', () => setTimeout(sync, 0));
        sync();
      }
      document.getElementById('closeDrawer').addEventListener('click', closeDrawer);
      backdrop.addEventListener('click', closeDrawer);
      document.getElementById('closePaymentPopup').addEventListener('click', closePaymentPopup);
      paymentBackdrop.addEventListener('click', closePaymentPopup);
      paymentPopupForm.planId.addEventListener('change', () => {
        const plan = planById(paymentPopupForm.planId.value);
        paymentPopupForm.amount.value = plan ? Number(plan.price || 0).toFixed(2) : '';
        paymentPopupForm.nextDue.value = nextDueFromToday(plan);
      });
      paymentPopupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const body = Object.fromEntries(new FormData(e.currentTarget).entries());
        const res = await api('/api/admin/payments', { method: 'POST', body: JSON.stringify(body) });
        if (res.ok) {
          await refresh();
          draw();
          drawAccess();
          document.getElementById('cashRows').innerHTML = renderCashList();
          closePaymentPopup();
          showToast('Pagamento confirmado e cadastro ativado.');
        } else {
          alert((await res.json().catch(() => ({}))).error || 'Nao foi possivel confirmar o pagamento.');
        }
      });
      document.getElementById('openNewStudent').addEventListener('click', () => {
        editPanel.innerHTML = studentCadastroForm();
        openDrawer('Cadastrar aluno');
        bindBirthDateAge(document.getElementById('studentForm'));
        document.getElementById('studentForm').addEventListener('submit', async (e) => {
          e.preventDefault();
          const body = await formWithPhoto(e.currentTarget);
          if (body.accessPassword !== body.confirmAccessPassword) {
            alert('A senha individual do aluno e a confirmaÃ§Ã£o precisam ser iguais.');
            return;
          }
          const res = await api('/api/admin/student', { method: 'POST', body: JSON.stringify(body) });
          if (res.ok) {
            const created = await res.json();
            await refresh();
            draw();
            closeDrawer();
            if (created.paymentAutoRegistered) showToast('Cadastro salvo e pagamento registrado no Caixa.');
            else {
              openPaymentPopup(created.id, 'matricula');
              showToast('Cadastro salvo. Confirme o pagamento para ativar.');
            }
          }
        });
      });
      document.getElementById('adminForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const body = Object.fromEntries(new FormData(e.currentTarget).entries());
        const res = await api('/api/admin/admins', { method: 'POST', body: JSON.stringify(body) });
        if (res.ok) { await refresh(); render(); }
      });
      document.getElementById('changePasswordForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const body = Object.fromEntries(new FormData(e.currentTarget).entries());
        const res = await api('/api/admin/password', { method: 'PUT', body: JSON.stringify(body) });
        if (res.ok) { pass.value = body.password; alert('Senha alterada.'); await refresh(); render(); }
      });
      document.getElementById('planForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const body = Object.fromEntries(new FormData(e.currentTarget).entries());
        const res = await api('/api/admin/plans', { method: 'POST', body: JSON.stringify(body) });
        if (res.ok) { await refresh(); render(); }
      });
      document.getElementById('paymentForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const body = Object.fromEntries(new FormData(e.currentTarget).entries());
        const res = await api('/api/admin/payments', { method: 'POST', body: JSON.stringify(body) });
        if (res.ok) { await refresh(); render(); }
        else alert((await res.json().catch(() => ({}))).error || 'Nao foi possivel lancar o pagamento.');
      });
      document.getElementById('productForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const body = Object.fromEntries(new FormData(e.currentTarget).entries());
        const res = await api('/api/admin/products', { method: 'POST', body: JSON.stringify(body) });
        if (res.ok) { await refresh(); render(); }
      });
      document.getElementById('productSaleForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const body = Object.fromEntries(new FormData(e.currentTarget).entries());
        const res = await api('/api/admin/product-sale', { method: 'POST', body: JSON.stringify(body) });
        if (res.ok) { await refresh(); render(); }
      });
      document.getElementById('cashRows').addEventListener('click', async (e) => {
        const button = e.target.closest('[data-delete-payment]');
        if (!button || !confirm('Excluir esta entrada do caixa?')) return;
        const res = await api('/api/admin/delete', { method: 'POST', body: JSON.stringify({ type: 'payment', id: button.dataset.deletePayment }) });
        if (res.ok) { await refresh(); render(); }
      });
      const q = document.getElementById('q');
      const pendingRows = document.getElementById('pendingRows');
      const activeRows = document.getElementById('activeRows');
      const inactiveRows = document.getElementById('inactiveRows');
      const deletedRows = document.getElementById('deletedRows');
      const editPanel = document.getElementById('editStudentPanel');
      function safe(value) { return String(value || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
      function selectedOption(value, expected) { return String(value || '') === String(expected || '') ? ' selected' : ''; }
      function checked(value) { return value ? ' checked' : ''; }
      function statusOf(s) { return s.status || (s.deleted ? 'Excluido' : s.inactive ? 'Inativo' : 'Ativo'); }
      function studentButton(s) {
        const notes = [];
        if (s.blocked) notes.push('Bloqueado');
        if (s.paymentStatus) notes.push(s.paymentStatus);
        return '<button class="name-list-row" data-edit-student="' + s.id + '"><strong>' + safe(s.name) + '</strong><span>' + (notes.join(' | ') || statusOf(s)) + '</span></button>';
      }
      document.getElementById('openNewProfessor').addEventListener('click', () => {
        editPanel.innerHTML = professorCadastroForm();
        openDrawer('Cadastrar professor');
        document.getElementById('professorForm').addEventListener('submit', async (e) => {
          e.preventDefault();
          const body = await formWithPhoto(e.currentTarget);
          const res = await api('/api/admin/professor', { method: 'POST', body: JSON.stringify(body) });
          if (res.ok) { await refresh(); drawAccess(); closeDrawer(); showToast('Cadastro salvo.'); }
        });
      });
      function renderEditProfessor(id) {
        const p = data.professors.find((item) => item.id === id);
        if (!p) return;
        editPanel.innerHTML = professorCadastroForm(p);
        openDrawer('Editar professor');
        document.getElementById('professorForm').addEventListener('submit', async (e) => {
          e.preventDefault();
          const body = await formWithPhoto(e.currentTarget);
          if (!body.photo) body.photo = p.photo || '';
          const res = await api('/api/admin/professor/' + p.id, { method: 'PUT', body: JSON.stringify(body) });
          if (res.ok) { await refresh(); drawAccess(); closeDrawer(); showToast('AlteraÃ§Ã£o salva.'); }
        });
        editPanel.querySelector('[data-popup-block-professor]')?.addEventListener('click', async () => {
          const res = await api('/api/admin/block', { method: 'PUT', body: JSON.stringify({ type: 'professor', id: p.id }) });
          if (res.ok) { await refresh(); drawAccess(); closeDrawer(); showToast('Acesso atualizado.'); }
        });
        editPanel.querySelector('[data-popup-delete-professor]')?.addEventListener('click', async () => {
          if (!confirm('Excluir este professor definitivamente?')) return;
          const res = await api('/api/admin/delete', { method: 'POST', body: JSON.stringify({ type: 'professor', id: p.id }) });
          if (res.ok) { await refresh(); drawAccess(); closeDrawer(); showToast('Cadastro excluido.'); }
        });
      }
      function renderEditStudent(id) {
        const s = data.students.find((item) => item.id === id);
        if (!s) return;
        openDrawer('Editar cadastro');
        const rules = s.accessRules || {};
        const access = s.access || {};
        editPanel.innerHTML = '<form id="editStudentForm" class="editor-form cadastro-form">' +
          '<fieldset><legend>Dados cadastrais</legend><label>MatrÃ­cula<input name="registration" value="' + safe(s.registration) + '"></label><label>Nome<input name="name" required value="' + safe(s.name) + '"></label><label>Foto atual<div class="student-photo-edit">' + (s.photo ? '<img src="' + safe(s.photo) + '" alt="">' : '<span>Sem foto</span>') + '</div><input name="photoFile" type="file" accept="image/*"></label><label>Endereco<input name="address" value="' + safe(s.address) + '"></label><label>Bairro<input name="district" value="' + safe(s.district) + '"></label><label>CEP<input name="zipCode" value="' + safe(s.zipCode) + '"></label><label>Cidade<input name="city" value="' + safe(s.city) + '"></label><label>UF<input name="state" value="' + safe(s.state) + '"></label><label>Telefone<input name="phone" value="' + safe(s.phone) + '"></label><label>Celular<input name="mobile" value="' + safe(s.mobile) + '"></label><label>Sexo<select name="gender"><option' + selectedOption(s.gender, 'Masculino') + '>Masculino</option><option' + selectedOption(s.gender, 'Feminino') + '>Feminino</option><option' + selectedOption(s.gender, 'Outro') + '>Outro</option></select></label><label>CPF<input name="cpf" required value="' + safe(s.cpf) + '"></label><label>Identidade<input name="identity" value="' + safe(s.identity) + '"></label><label>UF identidade<input name="identityState" value="' + safe(s.identityState) + '"></label><label>E-mail<input name="email" type="email" value="' + safe(s.email) + '"></label><label>Data nascimento<input name="birthDate" inputmode="numeric" placeholder="dd/mm/aaaa" maxlength="10" value="' + safe(s.birthDate) + '"></label><label>Idade<input name="age" type="number" readonly value="' + safe(s.age) + '"></label><label>SituaÃ§Ã£o<input name="situation" value="' + safe(s.situation) + '"></label><label>DÃ©bito<input name="debit" value="' + safe(s.debit) + '"></label><label>ObservaÃ§Ãµes<textarea name="registrationNotes" rows="4">' + safe(s.registrationNotes) + '</textarea></label></fieldset>' +
          '<fieldset><legend>Adicionais</legend><label>Validade exame mÃ©dico<input name="medicalExamValidUntil" type="date" value="' + safe(s.medicalExamValidUntil) + '"></label><label>Validade avaliaÃ§Ã£o fÃ­sica<input name="physicalAssessmentValidUntil" type="date" value="' + safe(s.physicalAssessmentValidUntil) + '"></label><label>Objetivo<input name="objective" value="' + safe(s.objective) + '"></label><label>ProfissÃ£o<input name="profession" value="' + safe(s.profession) + '"></label><label>Estado civil<select name="maritalStatus"><option></option><option' + selectedOption(s.maritalStatus, 'Solteiro(a)') + '>Solteiro(a)</option><option' + selectedOption(s.maritalStatus, 'Casado(a)') + '>Casado(a)</option><option' + selectedOption(s.maritalStatus, 'Divorciado(a)') + '>Divorciado(a)</option><option' + selectedOption(s.maritalStatus, 'ViÃºvo(a)') + '>ViÃºvo(a)</option></select></label><label>Empresa<input name="company" value="' + safe(s.company) + '"></label><label>Telefone da empresa<input name="companyPhone" value="' + safe(s.companyPhone) + '"></label><label>Como nos conheceu?<input name="referralSource" value="' + safe(s.referralSource) + '"></label><label>Nome do pai<input name="fatherName" value="' + safe(s.fatherName) + '"></label><label>Telefone pai<input name="fatherPhone" value="' + safe(s.fatherPhone) + '"></label><label>Nome da mÃ£e<input name="motherName" value="' + safe(s.motherName) + '"></label><label>Telefone mÃ£e<input name="motherPhone" value="' + safe(s.motherPhone) + '"></label><label>Mais informaÃ§Ãµes<textarea name="extraInfo" rows="4">' + safe(s.extraInfo) + '</textarea></label></fieldset>' +
          '<fieldset><legend>HorÃ¡rio</legend><label class="checkline"><input name="restrictedSchedule" type="checkbox" value="sim"' + checked(rules.restrictedSchedule) + '> Restringir acesso conforme horÃ¡rio</label><label>Dia da semana<select name="scheduleDay"><option></option><option' + selectedOption(rules.scheduleDay, 'Segunda') + '>Segunda</option><option' + selectedOption(rules.scheduleDay, 'TerÃ§a') + '>TerÃ§a</option><option' + selectedOption(rules.scheduleDay, 'Quarta') + '>Quarta</option><option' + selectedOption(rules.scheduleDay, 'Quinta') + '>Quinta</option><option' + selectedOption(rules.scheduleDay, 'Sexta') + '>Sexta</option><option' + selectedOption(rules.scheduleDay, 'SÃ¡bado') + '>SÃ¡bado</option><option' + selectedOption(rules.scheduleDay, 'Domingo') + '>Domingo</option></select></label><label>Entrada<input name="scheduleEntry" type="time" value="' + safe(rules.scheduleEntry) + '"></label><label>SaÃ­da<input name="scheduleExit" type="time" value="' + safe(rules.scheduleExit) + '"></label><label>Local<input name="schedulePlace" value="' + safe(rules.schedulePlace) + '"></label><label>Turma<input name="scheduleClass" value="' + safe(rules.scheduleClass) + '"></label><label class="checkline"><input name="limitDailyAccess" type="checkbox" value="sim"' + checked(rules.limitDailyAccess) + '> Restringir acessos por dia</label><label>Acessos por dia<input name="accessesPerDay" type="number" value="' + safe(rules.accessesPerDay) + '"></label><label class="checkline"><input name="limitWeeklyAccess" type="checkbox" value="sim"' + checked(rules.limitWeeklyAccess) + '> Restringir acessos por semana</label><label>Acessos por semana<input name="accessesPerWeek" type="number" value="' + safe(rules.accessesPerWeek) + '"></label><label class="checkline"><input name="reentryControl" type="checkbox" value="sim"' + checked(rules.reentryControl) + '> Controle de reentrada</label><label>Minutos reentrada<input name="reentryMinutes" type="number" value="' + safe(rules.reentryMinutes) + '"></label><label>Segundos reentrada<input name="reentrySeconds" type="number" value="' + safe(rules.reentrySeconds) + '"></label></fieldset>' +
          '<fieldset><legend>Acesso</legend><label>CartÃ£o de acesso?<select name="hasAccessCard"><option' + selectedOption(access.hasAccessCard, 'NÃ£o') + '>NÃ£o</option><option' + selectedOption(access.hasAccessCard, 'Sim') + '>Sim</option></select></label><label>NÂº do cartÃ£o<input name="accessCardNumber" value="' + safe(access.accessCardNumber) + '"></label><label>Senha individual do aluno<input name="accessPassword" value="' + safe(access.accessPassword) + '"></label><label>Status digital<input name="fingerprintStatus" value="' + safe(access.fingerprintStatus) + '"></label></fieldset>' +
          '<fieldset><legend>Plano e professor</legend><label>Professor<select name="professorId">' + professorOptions(s.professorId) + '</select></label><label>Plano<select name="planId">' + planOptions(s.planId) + '</select></label><label>Vencimento<input name="paymentDue" type="date" value="' + safe(s.paymentDue) + '"></label><label>Status pagamento<select name="paymentStatus"><option' + selectedOption(s.paymentStatus, 'Aguardando pagamento') + '>Aguardando pagamento</option><option' + selectedOption(s.paymentStatus, 'Em dia') + '>Em dia</option><option' + selectedOption(s.paymentStatus, 'Atencao') + '>Atencao</option><option' + selectedOption(s.paymentStatus, 'Vencido') + '>Vencido</option></select></label><label>Status do aluno<select name="status"><option' + selectedOption(s.status, 'Aguardando ativacao') + '>Aguardando ativacao</option><option' + selectedOption(s.status || 'Ativo', 'Ativo') + '>Ativo</option><option' + selectedOption(s.status, 'Inativo') + '>Inativo</option><option' + selectedOption(s.status, 'Excluido') + '>Excluido</option></select></label><label class="checkline"><input name="blocked" type="checkbox" value="sim"' + checked(s.blocked) + '> Bloquear acesso</label></fieldset>' +
          '<button class="button primary" type="submit">Salvar alteraÃ§Ãµes do aluno</button><button class="button neutral" type="button" data-open-turnstile-student="' + s.id + '">Liberar catraca</button>' + (statusOf(s) === 'Aguardando ativacao' ? '<button class="button neutral" type="button" data-pay-activate-student="' + s.id + '">Ativar com pagamento</button>' : '') + '<button class="button danger" type="button" data-popup-delete-student="' + s.id + '">Excluir aluno</button></form>';
        bindBirthDateAge(document.getElementById('editStudentForm'));
        document.getElementById('editStudentForm').addEventListener('submit', async (e) => {
          e.preventDefault();
          const form = await formWithPhoto(e.currentTarget);
          const body = {
            photo: form.photo || s.photo || "", faceVector: form.faceVector && form.faceVector.length ? form.faceVector : s.faceVector || [], registration: form.registration, name: form.name, address: form.address, district: form.district, zipCode: form.zipCode, city: form.city, state: form.state, phone: form.phone, mobile: form.mobile, gender: form.gender, cpf: form.cpf, identity: form.identity, identityState: form.identityState, email: form.email, birthDate: form.birthDate, age: form.age, situation: form.situation, debit: form.debit, registrationNotes: form.registrationNotes,
            medicalExamValidUntil: form.medicalExamValidUntil, physicalAssessmentValidUntil: form.physicalAssessmentValidUntil, objective: form.objective, profession: form.profession, maritalStatus: form.maritalStatus, company: form.company, companyPhone: form.companyPhone, referralSource: form.referralSource, fatherName: form.fatherName, fatherPhone: form.fatherPhone, motherName: form.motherName, motherPhone: form.motherPhone, extraInfo: form.extraInfo,
            professorId: form.professorId, planId: form.planId, paymentDue: form.paymentDue, paymentStatus: form.paymentStatus, status: form.status || 'Ativo', blocked: form.blocked === 'sim',
            accessRules: { restrictedSchedule: form.restrictedSchedule === 'sim', scheduleDay: form.scheduleDay, scheduleEntry: form.scheduleEntry, scheduleExit: form.scheduleExit, schedulePlace: form.schedulePlace, scheduleClass: form.scheduleClass, limitDailyAccess: form.limitDailyAccess === 'sim', accessesPerDay: form.accessesPerDay, limitWeeklyAccess: form.limitWeeklyAccess === 'sim', accessesPerWeek: form.accessesPerWeek, reentryControl: form.reentryControl === 'sim', reentryMinutes: form.reentryMinutes, reentrySeconds: form.reentrySeconds },
            access: { hasAccessCard: form.hasAccessCard, accessCardNumber: form.accessCardNumber, accessPassword: form.accessPassword, fingerprintStatus: form.fingerprintStatus }
          };
          const res = await api('/api/admin/student/' + s.id, { method: 'PUT', body: JSON.stringify(body) });
          if (res.ok) { await refresh(); draw(); closeDrawer(); showToast('AlteraÃ§Ã£o salva.'); }
          else alert((await res.json().catch(() => ({}))).error || 'Nao foi possivel salvar.');
        });
        editPanel.querySelector('[data-popup-delete-student]')?.addEventListener('click', async () => {
          if (!confirm('Mover este aluno para a lista de excluidos?')) return;
          const res = await api('/api/admin/student/' + s.id, { method: 'PUT', body: JSON.stringify({ status: 'Excluido', deleted: true, blocked: true }) });
          if (res.ok) { await refresh(); draw(); drawAccess(); closeDrawer(); showToast('Aluno movido para excluidos.'); }
        });
        editPanel.querySelector('[data-open-turnstile-student]')?.addEventListener('click', async () => {
          const res = await api('/api/admin/turnstile/open', { method: 'POST', body: JSON.stringify({ studentId: s.id, reason: 'manual-admin' }) });
          const answer = await res.json().catch(() => ({}));
          if (res.ok) {
            await refresh();
            document.getElementById('turnstileRows').innerHTML = renderTurnstileList();
            showToast('Comando enviado para o conector da catraca.');
          } else {
            alert(answer.error || 'Nao foi possivel liberar a catraca.');
          }
        });
        editPanel.querySelector('[data-pay-activate-student]')?.addEventListener('click', () => {
          closeDrawer();
          openPaymentPopup(s.id, 'matricula');
          showToast('Confira os dados e confirme o pagamento.');
        });
      }
      function draw() {
        const term = q.value.toLowerCase();
        const filtered = data.students.filter((s) => s.name.toLowerCase().includes(term) || (s.cpf || '').includes(term)).slice(0, 300);
        pendingRows.innerHTML = filtered.filter((s) => statusOf(s) === 'Aguardando ativacao').map(studentButton).join('') || '<p class="empty">Nenhuma matricula pendente.</p>';
        activeRows.innerHTML = filtered.filter((s) => statusOf(s) === 'Ativo').map(studentButton).join('') || '<p class="empty">Nenhum aluno ativo.</p>';
        inactiveRows.innerHTML = filtered.filter((s) => statusOf(s) === 'Inativo').map(studentButton).join('') || '<p class="empty">Nenhum aluno inativo.</p>';
        deletedRows.innerHTML = filtered.filter((s) => statusOf(s) === 'Excluido').map(studentButton).join('') || '<p class="empty">Nenhum aluno excluido.</p>';
      }
      document.getElementById('alunos').addEventListener('click', async (e) => {
        const editButton = e.target.closest('[data-edit-student]');
        if (editButton) { renderEditStudent(editButton.dataset.editStudent); return; }
      });
      function drawAccess() {
        document.getElementById('professorRows').innerHTML = '<h3>Professores</h3>' + data.professors.map((p) => '<button class="name-list-row" data-edit-professor="' + p.id + '"><strong>' + safe(p.name) + '</strong><span>' + (p.cref ? 'CREF: ' + safe(p.cref) + ' | ' : '') + (p.blocked ? 'Bloqueado' : 'Liberado') + '</span></button>').join('');
        document.getElementById('adminRows').innerHTML = '<h3>Administradores</h3>' + data.admins.map((a) => '<div class="admin-row"><div><strong>' + a.name + '</strong><span>Usuario: ' + a.username + ' | ' + (a.blocked ? 'Bloqueado' : 'Liberado') + '</span></div><div class="inline-actions"><button class="button neutral" data-block-admin="' + a.id + '">' + (a.blocked ? 'Desbloquear' : 'Bloquear') + '</button><button class="button danger" data-delete-admin="' + a.id + '">Excluir</button></div></div>').join('');
        document.getElementById('planRows').innerHTML = '<h3>Planos cadastrados</h3>' + data.plans.map((p) => '<div class="admin-row"><div><strong>' + p.name + '</strong><span>' + p.type + ' | ' + money(p.price) + '</span></div><button class="button danger" data-delete-plan="' + p.id + '">Excluir</button></div>').join('');
        document.getElementById('productRows').innerHTML = '<h3>Produtos cadastrados</h3>' + (data.products || []).map((p) => '<div class="admin-row"><div><strong>' + p.name + '</strong><span>' + money(p.price) + ' | Estoque: ' + (p.stock ?? 0) + '</span></div><button class="button danger" data-delete-product="' + p.id + '">Excluir</button></div>').join('');
      }
      document.getElementById('professorRows').addEventListener('click', async (e) => {
        const editButton = e.target.closest('[data-edit-professor]');
        if (editButton) renderEditProfessor(editButton.dataset.editProfessor);
      });
      document.getElementById('adminRows').addEventListener('click', async (e) => {
        const deleteButton = e.target.closest('[data-delete-admin]');
        if (deleteButton) {
          if (!confirm('Excluir este administrador definitivamente?')) return;
          const res = await api('/api/admin/delete', { method: 'POST', body: JSON.stringify({ type: 'admin', id: deleteButton.dataset.deleteAdmin }) });
          if (res.ok) { await refresh(); drawAccess(); showToast('Cadastro excluido.'); }
          return;
        }
        const button = e.target.closest('[data-block-admin]');
        if (!button) return;
        const res = await api('/api/admin/block', { method: 'PUT', body: JSON.stringify({ type: 'admin', id: button.dataset.blockAdmin }) });
        if (res.ok) { await refresh(); drawAccess(); }
      });
      document.getElementById('planRows').addEventListener('click', async (e) => {
        const button = e.target.closest('[data-delete-plan]');
        if (!button || !confirm('Excluir este plano definitivamente?')) return;
        const res = await api('/api/admin/delete', { method: 'POST', body: JSON.stringify({ type: 'plan', id: button.dataset.deletePlan }) });
        if (res.ok) { await refresh(); render(); }
      });
      document.getElementById('productRows').addEventListener('click', async (e) => {
        const button = e.target.closest('[data-delete-product]');
        if (!button || !confirm('Excluir este produto definitivamente?')) return;
        const res = await api('/api/admin/delete', { method: 'POST', body: JSON.stringify({ type: 'product', id: button.dataset.deleteProduct }) });
        if (res.ok) { await refresh(); render(); }
      });
      q.addEventListener('input', draw);
      draw();
      drawAccess();
    }
    document.getElementById('enter').addEventListener('click', enter);
    pass.addEventListener('keydown', (e) => { if (e.key === 'Enter') enter(); });
  </script>`);
}

async function serveAsset(pathname, res) {
  const filePath = join(publicDir, decodeURIComponent(pathname).replace(/^\/+/, ""));
  if (!filePath.startsWith(publicDir) || !existsSync(filePath)) return false;
  const extension = extname(filePath).toLowerCase();
  const types = {
    ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif"
  };
  const type = types[extension] || "application/octet-stream";
  send(res, 200, await readFile(filePath), type);
  return true;
}

function paymentTotals(db) {
  const totals = { total: 0, dinheiro: 0, pix: 0, debito: 0, credito: 0 };
  for (const payment of db.payments || []) {
    const amount = Number(payment.amount || 0);
    totals.total += amount;
    if (totals[payment.method] !== undefined) totals[payment.method] += amount;
  }
  return totals;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    const db = await loadDb();
    if (url.pathname.startsWith("/assets/")) {
      if (!(await serveAsset(url.pathname, res))) send(res, 404, "Arquivo nao encontrado");
      return;
    }
    if (req.method === "GET" && url.pathname === "/") return send(res, 200, homePage());
    if (req.method === "GET" && url.pathname === "/matricula") return send(res, 200, enrollmentPage(db));
    if (req.method === "GET" && url.pathname === "/alunos") return send(res, 200, studentAccessPage());
    if (req.method === "GET" && url.pathname === "/presenca") return send(res, 200, attendancePage());
    if (req.method === "GET" && (url.pathname === "/professor" || url.pathname === "/professores")) return send(res, 200, professorsPage(db));
    if (req.method === "GET" && url.pathname === "/admin") return send(res, 200, adminPage());
    if (req.method === "GET" && url.pathname.startsWith("/aluno/")) return send(res, 200, studentPage(decodeURIComponent(url.pathname.split("/").pop())));
    if (req.method === "GET" && url.pathname.startsWith("/professor/")) return send(res, 200, professorPage(decodeURIComponent(url.pathname.split("/").pop())));
    if (req.method === "POST" && url.pathname === "/api/matricula") {
      const body = await readBody(req);
      const cpf = onlyDigits(body.cpf);
      if (!body.photo || !String(body.photo).startsWith("data:image/")) return json(res, 400, { error: "A foto tirada no momento do cadastro e obrigatoria." });
      if (!body.name || !cpf || !body.birthDate || !body.phone || !body.address || !body.district || !body.city || !body.state) return json(res, 400, { error: "Preencha todos os dados obrigatorios." });
      if (!body.password || String(body.password).length < 4) return json(res, 400, { error: "Crie uma senha com pelo menos 4 caracteres." });
      if (body.password !== body.confirmPassword) return json(res, 400, { error: "As senhas digitadas nao conferem." });
      const plan = db.plans.find((item) => item.id === body.planId && item.active !== false);
      if (!plan) return json(res, 400, { error: "Escolha o plano desejado antes de enviar." });
      if (db.students.some((student) => onlyDigits(student.cpf) === cpf)) return json(res, 409, { error: "Ja existe um cadastro com este CPF. Entre em contato pelo WhatsApp para recuperar senha.", contactUrl: "https://wa.me/5582996724169?text=recuperar%20senha" });
      if (!isUsableFaceVector(body.faceVector)) return json(res, 400, { error: "Nao foi possivel validar a foto facial. Tire outra foto com o rosto centralizado e boa iluminacao." });
      const faceDuplicate = findFaceDuplicate(db, body.faceVector);
      if (faceDuplicate) return json(res, 409, { error: "Ja existe um cadastro com caracteristicas faciais muito parecidas. Procure a administracao para conferencia.", faceScore: faceDuplicate.score, contactUrl: "https://wa.me/5582996724169?text=recuperar%20senha" });
      const student = buildStudent(db, {
        ...body,
        cpf,
        mobile: body.phone,
        planId: plan.id,
        paymentStatus: "Aguardando pagamento",
        status: "Aguardando ativacao",
        blocked: true,
        notes: "Matricula online aguardando ativacao"
      });
      db.students.push(student);
      await saveDb(db);
      return json(res, 201, { ok: true, name: student.name, slug: student.slug });
    }
    if (req.method === "GET" && url.pathname === "/api/students") {
      const search = url.searchParams.get("search") || "";
      const cpf = onlyDigits(search);
      const name = normalize(search);
      const result = db.students
        .filter((s) => canStudentAccess(s) && ((cpf && onlyDigits(s.cpf) === cpf) || normalize(s.name) === name))
        .slice(0, 1)
        .map((s) => ({ name: s.name, slug: s.slug }));
      return json(res, 200, result);
    }
    if (req.method === "GET" && url.pathname === "/api/attendance/reference") {
      const search = url.searchParams.get("search") || "";
      const cpf = onlyDigits(search);
      const name = normalize(search);
      const student = db.students.find((s) => (cpf && onlyDigits(s.cpf) === cpf) || normalize(s.name) === name);
      if (!student) return json(res, 404, { error: "Aluno nao encontrado. Digite o nome completo ou CPF cadastrado." });
      if (!canStudentAccess(student)) return json(res, 403, { error: studentAccessMessage(student) });
      if (!isUsableFaceVector(student.faceVector)) return json(res, 400, { error: "Aluno sem assinatura facial valida. Atualize a foto no administrador antes de usar reconhecimento facial." });
      return json(res, 200, { studentId: student.id, studentName: student.name });
    }
    if (req.method === "GET" && url.pathname === "/api/attendance/references") {
      return json(res, 403, { error: "Lista publica de fotos desativada na versao online." });
    }
    if (req.method === "POST" && url.pathname === "/api/student/face-login") {
      const body = await readBody(req);
      const search = body.search || "";
      const cpf = onlyDigits(search);
      const name = normalize(search);
      const student = db.students.find((s) => (cpf && onlyDigits(s.cpf) === cpf) || normalize(s.name) === name);
      if (!student) return json(res, 404, { error: "Aluno nao encontrado. Digite o nome completo ou CPF cadastrado." });
      if (!canStudentAccess(student)) return json(res, 403, { error: studentAccessMessage(student) });
      if (!isUsableFaceVector(student.faceVector)) return json(res, 400, { error: "Aluno sem assinatura facial valida. Atualize a foto no administrador." });
      if (!isUsableFaceVector(body.faceVector)) return json(res, 400, { error: "Selfie sem qualidade suficiente. Tire outra foto com boa iluminacao." });
      const faceScore = compareFaceVectors(student.faceVector, body.faceVector);
      const faceMatched = faceScore >= 82;
      if (!faceMatched || faceScore < 82) return json(res, 403, { error: "Acesso negado. A selfie nao confere com seguranca com a foto cadastrada." });
      const token = randomUUID();
      const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
      db.faceSessions ||= [];
      db.faceSessions.push({ token, studentId: student.id, createdAt: new Date().toISOString(), expiresAt, faceScore });
      await saveDb(db);
      return json(res, 200, { token, slug: student.slug, studentName: student.name, faceScore, expiresAt });
    }
    if (req.method === "POST" && url.pathname === "/api/student/face-login-auto") {
      const body = await readBody(req);
      if (!isUsableFaceVector(body.faceVector)) return json(res, 400, { error: "Selfie sem qualidade suficiente. Tire outra foto com boa iluminacao." });
      const candidates = (db.students || [])
        .filter((student) => canStudentAccess(student) && isUsableFaceVector(student.faceVector))
        .map((student) => ({ student, score: compareFaceVectors(student.faceVector, body.faceVector) }))
        .sort((a, b) => b.score - a.score);
      const best = candidates[0];
      const second = candidates[1];
      if (!best) return json(res, 404, { error: "Nenhum aluno ativo com foto facial valida foi encontrado." });
      const student = best.student;
      if (!canStudentAccess(student)) return json(res, 403, { error: studentAccessMessage(student) });
      const faceScore = best.score;
      const faceGap = second ? faceScore - second.score : 100;
      const faceMatched = faceScore >= 82 && faceGap >= 8;
      if (!faceMatched || faceScore < 82 || faceGap < 8) return json(res, 403, { error: "Acesso negado. A selfie nao conferiu com seguranca. Tente novamente com boa luz ou procure a recepcao." });
      const token = randomUUID();
      const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
      db.faceSessions ||= [];
      db.faceSessions.push({ token, studentId: student.id, createdAt: new Date().toISOString(), expiresAt, faceScore });
      await saveDb(db);
      return json(res, 200, { token, slug: student.slug, studentName: student.name, faceScore, expiresAt });
    }
    if (req.method === "POST" && url.pathname === "/api/attendance/checkin") {
      const body = await readBody(req);
      const search = body.search || "";
      const cpf = onlyDigits(search);
      const name = normalize(search);
      const student = db.students.find((s) => (cpf && onlyDigits(s.cpf) === cpf) || normalize(s.name) === name);
      if (!student) return json(res, 404, { error: "Aluno nao encontrado. Digite o nome completo ou CPF cadastrado." });
      if (!canStudentAccess(student)) return json(res, 403, { error: studentAccessMessage(student) });
      if (!isUsableFaceVector(student.faceVector)) return json(res, 400, { error: "Aluno sem assinatura facial valida. Atualize a foto no administrador antes de usar reconhecimento facial." });
      if (!body.photo) return json(res, 400, { error: "Tire a foto facial antes de registrar." });
      if (!isUsableFaceVector(body.faceVector)) return json(res, 400, { error: "Selfie sem qualidade suficiente. Tire outra foto com boa iluminacao." });
      const faceScore = compareFaceVectors(student.faceVector, body.faceVector);
      const faceMatched = faceScore >= 82;
      if (!faceMatched || faceScore < 82) return json(res, 403, { error: "Presenca negada. A selfie nao confere com seguranca com a foto cadastrada." });
      const now = new Date();
      const today = now.toISOString().slice(0, 10);
      const alreadyToday = (db.attendance || []).find((entry) => entry.studentId === student.id && String(entry.createdAt || "").slice(0, 10) === today);
      if (alreadyToday) {
        student.lastCheckin = alreadyToday.createdAt.slice(0, 10);
        return json(res, 200, { duplicate: true, message: "Presenca ja registrada hoje.", studentName: student.name, time: new Date(alreadyToday.createdAt).toLocaleString("pt-BR"), faceScore });
      }
      const entry = {
        id: `presenca-${Date.now()}`,
        studentId: student.id,
        studentName: student.name,
        photo: body.photo,
        method: "foto facial",
        faceScore,
        faceMatched: true,
        status: "Registrado",
        createdAt: now.toISOString()
      };
      db.attendance ||= [];
      db.attendance.push(entry);
      const total = db.attendance.filter((item) => item.studentId === student.id).length;
      student.lastCheckin = today;
      student.frequency = `${total} presenca${total === 1 ? "" : "s"} registrada${total === 1 ? "" : "s"}`;
      await saveDb(db);
      return json(res, 201, { message: "Presenca registrada.", studentName: student.name, time: now.toLocaleString("pt-BR"), faceScore, entry });
    }
    if (req.method === "GET" && url.pathname.startsWith("/api/student/")) {
      const slug = decodeURIComponent(url.pathname.split("/").pop());
      const student = db.students.find((s) => s.slug === slug || s.id === slug);
      if (!student) return json(res, 404, { error: "Aluno nao encontrado" });
      if (!canStudentAccess(student)) return json(res, 403, { error: studentAccessMessage(student) });
      if (!okStudentPassword(req, db, student) && !okStudentFaceToken(req, db, student)) return json(res, 401, { error: "Senha incorreta" });
      return json(res, 200, { ...student, professorName: professorName(db, student.professorId) });
    }
    if (req.method === "POST" && url.pathname.match(/^\/api\/student\/[^/]+\/turnstile\/open$/)) {
      const slug = decodeURIComponent(url.pathname.split("/")[3]);
      const student = db.students.find((s) => s.slug === slug || s.id === slug);
      if (!student) return json(res, 404, { error: "Aluno nao encontrado" });
      if (!canStudentAccess(student)) return json(res, 403, { error: studentAccessMessage(student) });
      if (student.paymentStatus && student.paymentStatus !== "Em dia") return json(res, 403, { error: "Aluno sem pagamento em dia." });
      if (!okStudentPassword(req, db, student) && !okStudentFaceToken(req, db, student)) return json(res, 401, { error: "Senha incorreta" });
      const today = new Date().toISOString().slice(0, 10);
      const alreadyToday = (db.turnstileCommands || []).some((item) => item.studentId === student.id && item.reason === "student-page" && String(item.createdAt || "").slice(0, 10) === today && item.status !== "failed");
      if (alreadyToday) return json(res, 429, { error: "A catraca ja foi liberada hoje pela sua pagina. Procure a recepcao se precisar liberar novamente." });
      const command = createTurnstileCommand(db, student, "student-page");
      await saveDb(db);
      return json(res, 201, { ok: true, command, message: "Liberacao enviada. A catraca ficara livre por 10 segundos." });
    }
    if (req.method === "GET" && url.pathname.match(/^\/api\/professor\/[^/]+\/students$/)) {
      const professorId = url.pathname.split("/")[3];
      if (!okProfessorPassword(req, db, professorId)) return json(res, 401, { error: "Senha incorreta ou professor bloqueado" });
      return json(res, 200, { students: db.students.filter((s) => s.professorId === professorId && canStudentAccess(s)), exercises: db.exercises });
    }
    if (req.method === "PUT" && url.pathname.match(/^\/api\/professor\/[^/]+\/password$/)) {
      const professorId = url.pathname.split("/")[3];
      if (!okProfessorPassword(req, db, professorId)) return json(res, 401, { error: "Senha incorreta ou professor bloqueado" });
      const professor = db.professors.find((item) => item.id === professorId);
      const body = await readBody(req);
      professor.password = body.password || professor.password;
      await saveDb(db);
      return json(res, 200, { ok: true });
    }
    if (req.method === "PUT" && url.pathname.startsWith("/api/student/")) {
      if (!okAnyProfessorPassword(req, db)) return json(res, 401, { error: "Senha incorreta" });
      const id = decodeURIComponent(url.pathname.split("/").pop());
      const student = db.students.find((s) => s.id === id);
      if (!student) return json(res, 404, { error: "Aluno nao encontrado" });
      Object.assign(student, await readBody(req));
      await saveDb(db);
      return json(res, 200, student);
    }
    if (req.method === "GET" && url.pathname === "/api/admin") {
      if (!okAdmin(req, db)) return json(res, 401, { error: "Senha incorreta" });
      return json(res, 200, { professors: db.professors, students: db.students, admins: db.admins, plans: db.plans, products: db.products, payments: db.payments, attendance: db.attendance || [], turnstile: db.turnstile, turnstileCommands: db.turnstileCommands || [], turnstileEvents: db.turnstileEvents || [], paymentTotals: paymentTotals(db) });
    }
    if (req.method === "POST" && url.pathname === "/api/admin/turnstile/open") {
      if (!okAdmin(req, db)) return json(res, 401, { error: "Senha incorreta" });
      const body = await readBody(req);
      const student = db.students.find((s) => s.id === body.studentId || s.slug === body.studentId);
      if (!student) return json(res, 404, { error: "Aluno nao encontrado." });
      if (!canStudentAccess(student)) return json(res, 403, { error: studentAccessMessage(student) || "Aluno sem acesso liberado." });
      if (student.paymentStatus && student.paymentStatus !== "Em dia") return json(res, 403, { error: "Aluno sem pagamento em dia." });
      const command = createTurnstileCommand(db, student, body.reason || "manual-admin");
      await saveDb(db);
      return json(res, 201, { ok: true, command });
    }
    if (req.method === "GET" && url.pathname === "/api/turnstile/pending") {
      const token = url.searchParams.get("token") || req.headers["x-turnstile-token"];
      if (!token || token !== db.turnstile?.connectorToken) return json(res, 401, { error: "Token da catraca invalido." });
      const now = Date.now();
      const commands = (db.turnstileCommands || [])
        .filter((item) => item.status === "pending" && new Date(item.expiresAt).getTime() > now)
        .slice(0, 5);
      for (const command of commands) {
        command.status = "sent";
        command.sentAt = new Date().toISOString();
        command.attempts = Number(command.attempts || 0) + 1;
      }
      if (commands.length) await saveDb(db);
      return json(res, 200, { ok: true, turnstile: db.turnstile, commands });
    }
    if (req.method === "GET" && url.pathname === "/api/turnstile/offline-students") {
      const token = url.searchParams.get("token") || req.headers["x-turnstile-token"];
      if (!token || token !== db.turnstile?.connectorToken) return json(res, 401, { error: "Token da catraca invalido." });
      return json(res, 200, {
        ok: true,
        generatedAt: new Date().toISOString(),
        students: offlineTurnstileStudents(db)
      });
    }
    if (req.method === "POST" && url.pathname === "/api/turnstile/biometric-open") {
      const token = url.searchParams.get("token") || req.headers["x-turnstile-token"];
      if (!token || token !== db.turnstile?.connectorToken) return json(res, 401, { error: "Token da catraca invalido." });
      const body = await readBody(req);
      const cpf = onlyDigits(body.cpf || body.identifier || "");
      const identifier = normalize(body.identifier || body.name || "");
      const student = db.students.find((s) =>
        (cpf && onlyDigits(s.cpf) === cpf) ||
        (cpf && onlyDigits(s.registration) === cpf) ||
        (cpf && onlyDigits(s.access?.accessCardNumber) === cpf) ||
        (identifier && normalize(s.name) === identifier)
      );
      if (!student) return json(res, 404, { error: "Aluno nao encontrado para biometria." });
      if (!canStudentAccess(student)) return json(res, 403, { error: studentAccessMessage(student) });
      if (student.paymentStatus && student.paymentStatus !== "Em dia") return json(res, 403, { error: "Aluno sem pagamento em dia." });
      const command = createTurnstileCommand(db, student, "biometric-local");
      await saveDb(db);
      return json(res, 201, { ok: true, command, studentName: student.name });
    }
    if (req.method === "POST" && url.pathname === "/api/turnstile/result") {
      const token = url.searchParams.get("token") || req.headers["x-turnstile-token"];
      if (!token || token !== db.turnstile?.connectorToken) return json(res, 401, { error: "Token da catraca invalido." });
      const body = await readBody(req);
      const command = (db.turnstileCommands || []).find((item) => item.id === body.id);
      if (!command) return json(res, 404, { error: "Comando nao encontrado." });
      command.status = body.ok ? "opened" : "failed";
      command.message = body.message || "";
      command.finishedAt = new Date().toISOString();
      db.turnstileEvents ||= [];
      db.turnstileEvents.push({
        id: `evento-catraca-${Date.now()}`,
        commandId: command.id,
        studentId: command.studentId,
        studentName: command.studentName,
        ok: Boolean(body.ok),
        message: body.message || "",
        createdAt: new Date().toISOString()
      });
      await saveDb(db);
      return json(res, 200, { ok: true });
    }
    if (req.method === "POST" && url.pathname === "/api/admin/professor") {
      if (!okAdmin(req, db)) return json(res, 401, { error: "Senha incorreta" });
      const body = await readBody(req);
      const id = `professor-${Date.now()}`;
      const professor = {
        id,
        photo: body.photo || "",
        name: body.name || "Professor",
        password: body.password || db.passwords?.professor || "professor2026",
        cpf: onlyDigits(body.cpf),
        identity: body.identity || "",
        email: body.email || "",
        phone: body.phone || "",
        mobile: body.mobile || "",
        birthDate: body.birthDate || "",
        address: body.address || "",
        district: body.district || "",
        zipCode: body.zipCode || "",
        city: body.city || "",
        state: body.state || "",
        cref: body.cref || "",
        crefState: body.crefState || "",
        notes: body.notes || "",
        blocked: false
      };
      db.professors.push(professor);
      await saveDb(db);
      return json(res, 201, professor);
    }
    if (req.method === "PUT" && url.pathname.startsWith("/api/admin/professor/")) {
      if (!okAdmin(req, db)) return json(res, 401, { error: "Senha incorreta" });
      const id = decodeURIComponent(url.pathname.split("/").pop());
      const professor = db.professors.find((p) => p.id === id);
      if (!professor) return json(res, 404, { error: "Professor nao encontrado" });
      const body = await readBody(req);
      Object.assign(professor, {
        photo: body.photo || professor.photo || "",
        name: body.name || professor.name || "Professor",
        password: body.password || professor.password || db.passwords?.professor || "professor2026",
        cpf: onlyDigits(body.cpf),
        identity: body.identity || "",
        email: body.email || "",
        phone: body.phone || "",
        mobile: body.mobile || "",
        birthDate: body.birthDate || "",
        address: body.address || "",
        district: body.district || "",
        zipCode: body.zipCode || "",
        city: body.city || "",
        state: body.state || "",
        cref: body.cref || "",
        crefState: body.crefState || "",
        notes: body.notes || ""
      });
      await saveDb(db);
      return json(res, 200, professor);
    }
    if (req.method === "POST" && url.pathname === "/api/admin/student") {
      if (!okAdmin(req, db)) return json(res, 401, { error: "Senha incorreta" });
      const body = await readBody(req);
      const cpf = onlyDigits(body.cpf);
      if (!cpf) return json(res, 400, { error: "CPF obrigatorio para concluir o cadastro." });
      if (db.students.some((student) => onlyDigits(student.cpf) === cpf)) return json(res, 409, { error: "Ja existe um aluno cadastrado com este CPF." });
      if (Array.isArray(body.faceVector) && body.faceVector.length && !isUsableFaceVector(body.faceVector)) return json(res, 400, { error: "A foto facial nao tem qualidade suficiente. Tire outra foto com boa iluminacao." });
      const faceDuplicate = findFaceDuplicate(db, body.faceVector);
      if (faceDuplicate) return json(res, 409, { error: "Ja existe um cadastro com caracteristicas faciais muito parecidas. Confira antes de cadastrar novamente." });
      const student = buildStudent(db, body);
      db.students.push(student);
      const plan = db.plans.find((item) => item.id === student.planId);
      const shouldRegisterPayment = (student.paymentStatus || "Em dia") === "Em dia" || student.status === "Ativo";
      const payment = shouldRegisterPayment ? registerStudentPayment(db, student, plan, { ...body, source: "matricula" }) : null;
      await saveDb(db);
      return json(res, 201, { ...student, paymentAutoRegistered: Boolean(payment), payment });
    }
    if (req.method === "PUT" && url.pathname.startsWith("/api/admin/student/")) {
      if (!okAdmin(req, db)) return json(res, 401, { error: "Senha incorreta" });
      const id = decodeURIComponent(url.pathname.split("/").pop());
      const student = db.students.find((s) => s.id === id);
      if (!student) return json(res, 404, { error: "Aluno nao encontrado" });
      const body = await readBody(req);
      const plan = db.plans.find((item) => item.id === body.planId);
      if (body.cpf !== undefined) {
        const cpf = onlyDigits(body.cpf);
        if (!cpf) return json(res, 400, { error: "CPF obrigatorio para concluir o cadastro." });
        if (db.students.some((item) => item.id !== student.id && onlyDigits(item.cpf) === cpf)) return json(res, 409, { error: "Ja existe um aluno cadastrado com este CPF." });
      }
      if (body.faceVector !== undefined) {
        if (Array.isArray(body.faceVector) && !body.faceVector.length) delete body.faceVector;
        else if (!isUsableFaceVector(body.faceVector)) return json(res, 400, { error: "A foto facial nao tem qualidade suficiente. Tire outra foto com boa iluminacao." });
      }
      if (body.faceVector !== undefined) {
        const faceDuplicate = findFaceDuplicate(db, body.faceVector, student.id);
        if (faceDuplicate) return json(res, 409, { error: "Ja existe outro cadastro com caracteristicas faciais muito parecidas. Confira antes de salvar." });
      }
      if (studentStatus(student) === "Aguardando ativacao" && body.status === "Ativo" && !hasActivationPayment(db, student.id)) {
        return json(res, 400, { error: "Para ativar este aluno, primeiro efetive o pagamento no Caixa." });
      }
      Object.assign(student, body);
      if (body.cpf !== undefined) student.cpf = onlyDigits(body.cpf);
      if (body.birthDate !== undefined) {
        student.birthDate = normalizeBirthDate(body.birthDate, body.age);
        student.age = body.age || calculateAgeFromBirthDate(student.birthDate);
      }
      student.plan = plan?.name || student.plan || "";
      await saveDb(db);
      return json(res, 200, student);
    }
    if (req.method === "PUT" && url.pathname === "/api/admin/assign") {
      if (!okAdmin(req, db)) return json(res, 401, { error: "Senha incorreta" });
      const body = await readBody(req);
      const student = db.students.find((s) => s.id === body.studentId);
      const professor = db.professors.find((p) => p.id === body.professorId);
      if (!student || !professor) return json(res, 404, { error: "Aluno ou professor nao encontrado" });
      student.professorId = professor.id;
      await saveDb(db);
      return json(res, 200, { ok: true });
    }
    if (req.method === "POST" && url.pathname === "/api/admin/admins") {
      if (!okAdmin(req, db)) return json(res, 401, { error: "Senha incorreta" });
      const body = await readBody(req);
      const admin = { id: `admin-${Date.now()}`, name: body.name || "Admin", username: body.username || `admin${Date.now()}`, password: body.password || "admin2026", blocked: false, primary: false };
      db.admins.push(admin);
      await saveDb(db);
      return json(res, 201, admin);
    }
    if (req.method === "PUT" && url.pathname === "/api/admin/password") {
      const admin = currentAdmin(req, db);
      if (!admin) return json(res, 401, { error: "Senha incorreta" });
      const body = await readBody(req);
      admin.password = body.password || admin.password;
      await saveDb(db);
      return json(res, 200, { ok: true });
    }
    if (req.method === "POST" && url.pathname === "/api/admin/plans") {
      if (!okAdmin(req, db)) return json(res, 401, { error: "Senha incorreta" });
      const body = await readBody(req);
      const plan = { id: `plano-${Date.now()}`, name: body.name || "Plano", type: body.type || "mensal", price: Number(body.price || 0), active: true };
      db.plans.push(plan);
      await saveDb(db);
      return json(res, 201, plan);
    }
    if (req.method === "POST" && url.pathname === "/api/admin/products") {
      if (!okAdmin(req, db)) return json(res, 401, { error: "Senha incorreta" });
      const body = await readBody(req);
      const product = { id: `produto-${Date.now()}`, name: body.name || "Produto", price: Number(body.price || 0), stock: Number(body.stock || 0), active: true };
      db.products.push(product);
      await saveDb(db);
      return json(res, 201, product);
    }
    if (req.method === "POST" && url.pathname === "/api/admin/payments") {
      if (!okAdmin(req, db)) return json(res, 401, { error: "Senha incorreta" });
      const body = await readBody(req);
      const student = db.students.find((s) => s.id === body.studentId);
      if (!student) return json(res, 404, { error: "Aluno nao encontrado" });
      const plan = db.plans.find((p) => p.id === body.planId);
      const nextDue = body.nextDue || addMonths(student.paymentDue, monthsForPlan(plan));
      const payment = {
        id: `pagamento-${Date.now()}`,
        source: body.source || "mensalidade",
        studentId: student.id,
        studentName: student.name,
        planId: plan?.id || body.planId || "",
        planName: plan?.name || student.plan || "",
        amount: Number(body.amount || 0),
        method: body.method || "dinheiro",
        paidMonth: body.paidMonth || "",
        nextDue,
        paidAt: new Date().toISOString()
      };
      db.payments.push(payment);
      if (plan) {
        student.planId = plan.id;
        student.plan = plan.name;
      }
      if (nextDue) student.paymentDue = nextDue;
      student.paymentStatus = "Em dia";
      student.blocked = false;
      if (studentStatus(student) === "Aguardando ativacao" && ["matricula", "mensalidade"].includes(payment.source || "")) student.status = "Ativo";
      await saveDb(db);
      return json(res, 201, payment);
    }
    if (req.method === "POST" && url.pathname === "/api/admin/product-sale") {
      if (!okAdmin(req, db)) return json(res, 401, { error: "Senha incorreta" });
      const body = await readBody(req);
      const product = db.products.find((p) => p.id === body.productId);
      if (!product) return json(res, 404, { error: "Produto nao encontrado" });
      const quantity = Math.max(1, Number(body.quantity || 1));
      const payment = {
        id: `pagamento-${Date.now()}`,
        source: "produto",
        productId: product.id,
        productName: product.name,
        quantity,
        amount: Number(body.amount || product.price * quantity || 0),
        method: body.method || "dinheiro",
        paidAt: new Date().toISOString()
      };
      product.stock = Number(product.stock || 0) - quantity;
      db.payments.push(payment);
      await saveDb(db);
      return json(res, 201, payment);
    }
    if (req.method === "POST" && url.pathname === "/api/admin/delete") {
      if (!okAdmin(req, db)) return json(res, 401, { error: "Senha incorreta" });
      const body = await readBody(req);
      if (body.type === "student") {
        const student = db.students.find((entry) => entry.id === body.id);
        if (!student) return json(res, 404, { error: "Cadastro nao encontrado" });
        student.status = "Excluido";
        student.deleted = true;
        student.blocked = true;
        await saveDb(db);
        return json(res, 200, student);
      }
      const collections = { student: db.students, professor: db.professors, admin: db.admins, plan: db.plans, product: db.products, payment: db.payments };
      const collection = collections[body.type];
      if (!collection) return json(res, 400, { error: "Tipo invalido" });
      const index = collection.findIndex((entry) => entry.id === body.id);
      if (index === -1) return json(res, 404, { error: "Cadastro nao encontrado" });
      if (body.type === "admin" && collection[index].primary && db.admins.length <= 1) return json(res, 400, { error: "Nao e possivel excluir o unico administrador principal" });
      collection.splice(index, 1);
      await saveDb(db);
      return json(res, 200, { ok: true });
    }
    if (req.method === "PUT" && url.pathname === "/api/admin/block") {
      if (!okAdmin(req, db)) return json(res, 401, { error: "Senha incorreta" });
      const body = await readBody(req);
      const collections = { student: db.students, professor: db.professors, admin: db.admins };
      const item = collections[body.type]?.find((entry) => entry.id === body.id);
      if (!item) return json(res, 404, { error: "Cadastro nao encontrado" });
      item.blocked = !item.blocked;
      await saveDb(db);
      return json(res, 200, item);
    }
    send(res, 404, "Pagina nao encontrada");
  } catch (error) {
    console.error(error);
    json(res, 500, { error: "Erro interno" });
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log("\nFusion Combat Fit - servidor online iniciado");
  console.log("Endereco do servidor: http://localhost:" + port);
  for (const item of Object.values(os.networkInterfaces()).flat()) {
    if (item && item.family === "IPv4" && !item.internal) console.log("No Wi-Fi: http://" + item.address + ":" + port);
  }
  console.log("\nMantenha esta janela aberta enquanto o site estiver em uso.\n");
});




