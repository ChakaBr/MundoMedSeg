// Gera versoes/MundoMedSeg-v<versao>/ (programa pronto, sem precisar de Node) e o .zip.
// Monta o pacote direto: runtime do Electron + app em resources/app (formato padrao do Electron).
// Uso: npm run empacotar
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const RAIZ = path.resolve(__dirname, '..');
const pkg = require(path.join(RAIZ, 'package.json'));
const NOME = `MundoMedSeg-v${pkg.version}`;
const VERSOES = path.join(RAIZ, 'versoes');
const DESTINO = path.join(VERSOES, NOME);
const RUNTIME = path.join(RAIZ, 'node_modules', 'electron', 'dist');

async function main() {
  if (fs.existsSync(DESTINO)) throw new Error(`${NOME} ja existe em versoes/. Suba a versao em package.json (e no CHANGELOG) antes de empacotar.`);
  if (!fs.existsSync(path.join(RUNTIME, 'electron.exe'))) throw new Error('Runtime do Electron nao encontrado: rode npm install');
  if (!fs.existsSync(path.join(RAIZ, 'conteudo', 'conteudo.json'))) throw new Error('conteudo/ nao existe: rode npm run gerar-conteudo');

  fs.mkdirSync(VERSOES, { recursive: true });
  fs.cpSync(RUNTIME, DESTINO, { recursive: true });
  fs.renameSync(path.join(DESTINO, 'electron.exe'), path.join(DESTINO, 'MundoMedSeg.exe'));
  fs.rmSync(path.join(DESTINO, 'resources', 'default_app.asar'), { force: true });

  const app = path.join(DESTINO, 'resources', 'app');
  fs.mkdirSync(app, { recursive: true });
  fs.cpSync(path.join(RAIZ, 'src'), path.join(app, 'src'), { recursive: true });
  fs.cpSync(path.join(RAIZ, 'assets'), path.join(app, 'assets'), { recursive: true }); // icone da janela
  fs.cpSync(path.join(RAIZ, 'node_modules', 'pngjs'), path.join(app, 'node_modules', 'pngjs'), { recursive: true });
  const { name, productName, version, description, main } = pkg;
  fs.writeFileSync(path.join(app, 'package.json'), JSON.stringify({ name, productName, version, description, main }, null, 2));

  // icone do programa (Alyce, padrao) e dados de versao no proprio .exe
  const { rcedit } = await import('rcedit');
  await rcedit(path.join(DESTINO, 'MundoMedSeg.exe'), {
    icon: path.join(RAIZ, 'assets', 'icone.ico'),
    'file-version': `${pkg.version}.0`,
    'product-version': `${pkg.version}.0`,
    'version-string': { ProductName: 'Mundo Med+ Seg', FileDescription: 'Mundo Med+ Seg - Totem e Painel LED', CompanyName: 'Alyce', OriginalFilename: 'MundoMedSeg.exe', InternalName: 'MundoMedSeg' },
  });

  // conteudo fica ao lado do .exe (fora do app) para poder trocar artes/areas sem recompilar
  fs.cpSync(path.join(RAIZ, 'conteudo'), path.join(DESTINO, 'conteudo'), { recursive: true });
  for (const f of fs.readdirSync(path.join(RAIZ, 'scripts', 'pacote'))) {
    fs.copyFileSync(path.join(RAIZ, 'scripts', 'pacote', f), path.join(DESTINO, f));
  }
  fs.copyFileSync(path.join(RAIZ, 'CHANGELOG.md'), path.join(DESTINO, 'CHANGELOG.md'));

  const zip = path.join(VERSOES, `${NOME}.zip`);
  fs.rmSync(zip, { force: true });
  // tar.exe do Windows (bsdtar); o tar do Git Bash (GNU) confunde "D:" com host remoto
  const tarWin = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
  execFileSync(tarWin, ['-a', '-c', '-f', `${NOME}.zip`, '-C', NOME, '.'], { stdio: 'inherit', cwd: VERSOES });
  if (!fs.existsSync(zip) || fs.statSync(zip).size < 1e6) throw new Error('Falha ao criar o .zip');
  console.log(`\nPronto: ${DESTINO}\n        ${zip}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
