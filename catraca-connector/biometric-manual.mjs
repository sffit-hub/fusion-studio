import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { readFile } from "node:fs/promises";

const config = JSON.parse(await readFile(new URL("./config.json", import.meta.url), "utf8"));

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

const rl = createInterface({ input, output });
console.log("Teste de liberacao por biometria/manual");
console.log("Digite CPF, matricula, numero do cartao ou nome completo do aluno.");
console.log("Deixe vazio e pressione Enter para sair.\n");

while (true) {
  const identifier = (await rl.question("Aluno: ")).trim();
  if (!identifier) break;
  try {
    const result = await api("/api/turnstile/biometric-open", {
      method: "POST",
      body: JSON.stringify({ identifier })
    });
    console.log(`OK: comando criado para ${result.studentName}. O conector principal vai liberar a catraca.`);
  } catch (error) {
    console.log(`NEGADO: ${error.message}`);
  }
}

rl.close();
