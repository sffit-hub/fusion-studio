import { readFile, appendFile, writeFile, mkdir, readdir, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import net from "node:net";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const config = JSON.parse(await readFile(new URL("./config.json", import.meta.url), "utf8"));
const logFile = new URL("./catraca-connector.log", import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const offlineDir = path.resolve(__dirname, config.offline?.folder || "portaria-local");
const offlineCommandsDir = path.join(offlineDir, "comandos");
const offlineLogsDir = path.join(offlineDir, "registros");
const offlineStudentsPath = path.join(offlineDir, "alunos-liberados.json");
let lastOfflineSync = 0;

function now() {
  return new Date().toISOString();
}

async function log(message) {
  const line = `[${now()}] ${message}`;
  console.log(line);
  await appendFile(logFile, line + "\n", "utf8").catch(() => {});
}

async function ensureOfflineFolders() {
  await mkdir(offlineCommandsDir, { recursive: true });
  await mkdir(offlineLogsDir, { recursive: true });
  if (!existsSync(offlineStudentsPath)) {
    await writeFile(offlineStudentsPath, JSON.stringify({
      ok: true,
      generatedAt: null,
      students: []
    }, null, 2), "utf8");
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function api(path, options = {}) {
  const url = new URL(path, config.serverUrl);
  if (!url.searchParams.has("token")) url.searchParams.set("token", config.token);
  const res = await fetch(url, {
    ...options,
    headers: {
      "content-type": "application/json",
      "x-turnstile-token": config.token,
      ...(options.headers || {})
    }
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body;
}

async function syncOfflineStudents(force = false) {
  if (!config.offline?.enabled) return;
  const interval = Number(config.offline?.syncIntervalMs || 60000);
  if (!force && Date.now() - lastOfflineSync < interval) return;
  lastOfflineSync = Date.now();
  const data = await api("/api/turnstile/offline-students");
  await ensureOfflineFolders();
  await writeFile(offlineStudentsPath, JSON.stringify(data, null, 2), "utf8");
  await log(`Lista offline atualizada: ${(data.students || []).length} alunos liberados.`);
}

function openTcpRaw() {
  const commandHex = String(config.driver?.tcpOpenCommandHex || "").replace(/\s+/g, "");
  if (!commandHex) throw new Error("Modo tcp-raw sem tcpOpenCommandHex configurado.");
  const payload = Buffer.from(commandHex, "hex");
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error("Tempo esgotado ao comunicar com a catraca."));
    }, 5000);
    socket.connect(Number(config.turnstile.port || 3000), config.turnstile.ip, () => {
      socket.write(payload);
      socket.end();
    });
    socket.on("data", () => {});
    socket.on("close", () => {
      clearTimeout(timeout);
      resolve("Comando TCP enviado para a catraca.");
    });
    socket.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

function openByProgram(command) {
  const programPath = config.driver?.programPath;
  if (!programPath) throw new Error("Modo program sem programPath configurado.");
  const args = (config.driver?.programArgs || []).map((arg) =>
    String(arg)
      .replace("{studentId}", command.studentId || "")
      .replace("{studentName}", command.studentName || "")
      .replace("{commandId}", command.id || "")
  );
  return new Promise((resolve, reject) => {
    const child = spawn(programPath, args, { windowsHide: true });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk.toString(); });
    child.stderr.on("data", (chunk) => { output += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(output.trim() || "Programa local executado.");
      else reject(new Error(output.trim() || `Programa local saiu com codigo ${code}.`));
    });
  });
}

function openByHenryUi(command) {
  const holdSeconds = Math.max(1, Math.min(Number(command.holdSeconds || 10), 30));
  const title = config.driver?.henryUiWindowTitle || "Liberação de Catraca";
  const releaseMode = config.driver?.henryUiReleaseMode || "both";
  return new Promise((resolve, reject) => {
    const child = spawn("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      fileURLToPath(new URL("./henry-ui-release.ps1", import.meta.url)),
      "-WindowTitle",
      title,
      "-Seconds",
      String(holdSeconds),
      "-ReleaseMode",
      releaseMode
    ], { windowsHide: true });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk.toString(); });
    child.stderr.on("data", (chunk) => { output += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(output.trim() || "Liberacao enviada pela tela Henry7x.");
      else reject(new Error(output.trim() || `Automacao Henry7x saiu com codigo ${code}.`));
    });
  });
}

function openByOnline2Dll(command) {
  const node32Path = config.driver?.online2Dll?.node32Path || "C:\\Node32\\node.exe";
  const sentidoGiro = Number(command.direction || config.driver?.online2Dll?.sentidoGiro || 1);
  return new Promise((resolve, reject) => {
    const child = spawn(node32Path, [
      fileURLToPath(new URL("./online2-release.cjs", import.meta.url)),
      String(sentidoGiro)
    ], { windowsHide: true });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk.toString(); });
    child.stderr.on("data", (chunk) => { output += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => {
      const text = output.trim();
      if (code === 0) resolve(text || "Liberacao enviada pela Online2.dll.");
      else reject(new Error(text || `Online2.dll saiu com codigo ${code}.`));
    });
  });
}

async function openTurnstile(command) {
  const mode = config.driver?.mode || "dry-run";
  const holdSeconds = Number(command.holdSeconds || 3);
  if (mode === "dry-run") {
    await sleep(Math.min(holdSeconds, 10) * 1000);
    return `Teste recebido pelo conector. Janela simulada de ${holdSeconds} segundos. Modo dry-run nao abre a catraca.`;
  }
  if (mode === "henry-ui") return openByHenryUi(command);
  if (mode === "online2-dll") return openByOnline2Dll(command);
  if (mode === "tcp-raw") return openTcpRaw(command);
  if (mode === "program") return openByProgram(command);
  throw new Error(`Modo de driver desconhecido: ${mode}`);
}

async function appendOfflineRegister(command, ok, message) {
  await ensureOfflineFolders();
  const file = path.join(offlineLogsDir, `${new Date().toISOString().slice(0, 10)}.jsonl`);
  await appendFile(file, JSON.stringify({
    id: command.id,
    studentId: command.studentId,
    studentName: command.studentName,
    reason: command.reason || "offline",
    ok,
    message,
    createdAt: new Date().toISOString()
  }) + "\n", "utf8");
}

async function processOfflineCommands() {
  if (!config.offline?.enabled) return;
  await ensureOfflineFolders();
  const files = (await readdir(offlineCommandsDir)).filter((file) => file.endsWith(".json")).slice(0, 5);
  for (const file of files) {
    const fullPath = path.join(offlineCommandsDir, file);
    let command;
    try {
      command = JSON.parse(await readFile(fullPath, "utf8"));
      await log(`Comando local recebido: ${command.id} | ${command.studentName}`);
      const message = await openTurnstile(command);
      await appendOfflineRegister(command, true, message);
      await log(`OK LOCAL: ${message}`);
    } catch (error) {
      if (command) await appendOfflineRegister(command, false, error.message);
      await log(`FALHA LOCAL: ${error.message}`);
    } finally {
      await unlink(fullPath).catch(() => {});
    }
  }
}

async function report(command, ok, message) {
  await api("/api/turnstile/result", {
    method: "POST",
    body: JSON.stringify({ id: command.id, ok, message })
  });
}

async function loop() {
  await ensureOfflineFolders();
  await log(`Conector iniciado. Site: ${config.serverUrl} | Catraca: ${config.turnstile.ip}:${config.turnstile.port} | modo: ${config.driver?.mode}`);
  while (true) {
    await processOfflineCommands().catch((error) => log(`Falha na fila local: ${error.message}`));
    try {
      await syncOfflineStudents().catch((error) => log(`Lista offline ainda nao sincronizada: ${error.message}`));
      const data = await api("/api/turnstile/pending");
      for (const command of data.commands || []) {
        await log(`Comando recebido: ${command.id} | ${command.studentName}`);
        try {
          const message = await openTurnstile(command);
          await report(command, true, message);
          await log(`OK: ${message}`);
        } catch (error) {
          await report(command, false, error.message);
          await log(`FALHA: ${error.message}`);
        }
      }
    } catch (error) {
      await log(`Aguardando conexao: ${error.message}`);
    }
    await sleep(Number(config.pollIntervalMs || 2500));
  }
}

loop();
