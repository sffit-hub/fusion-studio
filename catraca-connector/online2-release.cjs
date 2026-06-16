const fs = require("fs");
const path = require("path");

const config = JSON.parse(fs.readFileSync(path.join(__dirname, "config.json"), "utf8"));
const dllConfig = config.driver && config.driver.online2Dll ? config.driver.online2Dll : {};
const dllPath = dllConfig.path || "C:\\PROSISTEMAS\\SCA\\Online2.dll";

function readDllArch(filePath) {
  const buffer = fs.readFileSync(filePath);
  const peOffset = buffer.readInt32LE(0x3c);
  const machine = buffer.readUInt16LE(peOffset + 4);
  if (machine === 0x014c) return "ia32";
  if (machine === 0x8664) return "x64";
  return `unknown-0x${machine.toString(16)}`;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!fs.existsSync(dllPath)) fail(`Online2.dll nao encontrada em ${dllPath}`);

const dllArch = readDllArch(dllPath);
if (dllArch === "ia32" && process.arch !== "ia32") {
  fail("Online2.dll e 32 bits. Execute este arquivo com Node 32 bits.");
}

let koffi;
try {
  koffi = require("koffi");
} catch {
  fail("Pacote koffi nao instalado para este Node. Rode: npm install koffi");
}

const lib = koffi.load(dllPath);
const ActiveDll = lib.func("int __stdcall ActiveDll()");
const OpenComm = lib.func("int __stdcall OpenComm(int tipoComm, int idEquipamento)");
const SetParameters = lib.func("int __stdcall SetParameters(str ip, int porta)");
const Liberate = lib.func("int __stdcall Liberate(int idEquipamento, int sentidoGiro)");
const CloseComm = lib.func("int __stdcall CloseComm()");

const tipoComm = Number(dllConfig.tipoComm || 2);
const idEquipamento = Number(dllConfig.idEquipamento || 1);
const ip = String(dllConfig.ip || config.turnstile.ip || "10.0.0.236");
const porta = Number(dllConfig.porta || config.turnstile.port || 3000);
const sentidoGiro = Number(process.argv[2] || dllConfig.sentidoGiro || 1);

try {
  const active = ActiveDll();
  const parameters = SetParameters(ip, porta);
  const open = OpenComm(tipoComm, idEquipamento);
  const liberate = Liberate(idEquipamento, sentidoGiro);
  const ok = liberate === 1;

  console.log(JSON.stringify({
    ok,
    active,
    parameters,
    open,
    liberate,
    idEquipamento,
    sentidoGiro,
    message: ok
      ? "Liberacao aceita pela Online2.dll."
      : "Online2.dll nao confirmou a liberacao."
  }));

  process.exit(ok ? 0 : 2);
} catch (error) {
  fail(error && error.message ? error.message : String(error));
} finally {
  try {
    CloseComm();
  } catch {}
}
