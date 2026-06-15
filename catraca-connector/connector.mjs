import { readFile, appendFile } from "node:fs/promises";
import net from "node:net";
import { spawn } from "node:child_process";

const config = JSON.parse(await readFile(new URL("./config.json", import.meta.url), "utf8"));
const logFile = new URL("./catraca-connector.log", import.meta.url);

function now() {
  return new Date().toISOString();
}

async function log(message) {
  const line = `[${now()}] ${message}`;
  console.log(line);
  await appendFile(logFile, line + "\n", "utf8").catch(() => {});
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

async function openTurnstile(command) {
  const mode = config.driver?.mode || "dry-run";
  const holdSeconds = Number(command.holdSeconds || 3);
  if (mode === "dry-run") {
    await sleep(Math.min(holdSeconds, 10) * 1000);
    return `Teste recebido pelo conector. Janela simulada de ${holdSeconds} segundos. Modo dry-run nao abre a catraca.`;
  }
  if (mode === "tcp-raw") return openTcpRaw(command);
  if (mode === "program") return openByProgram(command);
  throw new Error(`Modo de driver desconhecido: ${mode}`);
}

async function report(command, ok, message) {
  await api("/api/turnstile/result", {
    method: "POST",
    body: JSON.stringify({ id: command.id, ok, message })
  });
}

async function loop() {
  await log(`Conector iniciado. Site: ${config.serverUrl} | Catraca: ${config.turnstile.ip}:${config.turnstile.port} | modo: ${config.driver?.mode}`);
  while (true) {
    try {
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
