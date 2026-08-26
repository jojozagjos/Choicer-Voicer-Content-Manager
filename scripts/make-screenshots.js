'use strict';

/**
 * Captures the screenshots the README shows.
 *
 *   npm run shots              take them, using whatever was chosen last
 *   npm run shots -- --pick    choose which pack each one shows, then take them
 *   npm run shots -- --list    print the packs available to choose from
 *
 * A launcher only. The capture itself happens inside the app, next to the
 * smoke harness, because it needs the real window with the real IPC behind it.
 * Running the app a second way would mean a second copy of all of that.
 *
 * The window is never shown and never takes focus, so this does not interrupt
 * whatever you are doing and nothing outside the app lands in the picture.
 * That is also why choosing a pack happens here, in the terminal, rather than
 * by clicking one: there is nothing on screen to click.
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const electron = require(path.join(ROOT, 'node_modules', 'electron'));
const gamedata = require(path.join(ROOT, 'src', 'main', 'gamedata'));

// Kept beside the pictures it decides, and committed, so the same packs are
// used every time rather than whichever happened to sort first today.
const CHOICES = path.join(ROOT, 'docs', 'shots.json');

// The pictures that show one particular pack. The others show no pack at all.
const CHOOSABLE = [
  { key: 'editor', asks: 'the timeline editor' },
  { key: 'library', asks: 'the content library' },
  { key: 'export', asks: 'the export screen' },
];

function readChoices() {
  try {
    return JSON.parse(fs.readFileSync(CHOICES, 'utf8'));
  } catch {
    return {};
  }
}

function packsAvailable() {
  try {
    const model = gamedata.scanGame(gamedata.defaultGameDir());
    return (model.packs || [])
      .map((p) => ({
        title: p.title,
        lines: (p.lines || []).length,
        dubs: (p.sessions || []).length,
      }))
      .sort((a, b) => a.title.localeCompare(b.title));
  } catch (err) {
    console.log(`Could not read the game folder: ${err.message}`);
    return [];
  }
}

function show(packs) {
  const width = String(packs.length).length;
  packs.forEach((p, i) => {
    const n = String(i + 1).padStart(width);
    const lines = `${p.lines} line${p.lines === 1 ? '' : 's'}`;
    const dubs = p.dubs ? `, ${p.dubs} recorded` : '';
    console.log(`  ${n}. ${p.title}  (${lines}${dubs})`);
  });
}

function ask(rl, question) {
  return new Promise((resolve) => rl.question(question, (answer) => resolve(answer.trim())));
}

async function choose(packs) {
  const chosen = readChoices();
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log('\nPacks in your game folder:\n');
  show(packs);
  console.log('\nPick a number for each picture, or press Enter to leave one as it is.');
  console.log('Enter "auto" to let it choose for itself again.\n');

  for (const { key, asks } of CHOOSABLE) {
    const now = chosen[key] ? `currently ${chosen[key]}` : 'currently chosen automatically';
    const said = await ask(rl, `  Which pack for ${asks}? (${now}) `);
    if (!said) continue;
    if (/^auto$/i.test(said)) { delete chosen[key]; continue; }

    const n = Number(said);
    if (!Number.isInteger(n) || n < 1 || n > packs.length) {
      console.log(`  "${said}" is not one of the numbers above, so nothing changed.`);
      continue;
    }
    chosen[key] = packs[n - 1].title;
  }
  rl.close();

  fs.mkdirSync(path.dirname(CHOICES), { recursive: true });
  fs.writeFileSync(CHOICES, `${JSON.stringify(chosen, null, 2)}\n`);
  console.log(`\nSaved to ${path.relative(ROOT, CHOICES)}.\n`);
  return chosen;
}

(async () => {
  const args = process.argv.slice(2);
  const packs = packsAvailable();

  if (args.includes('--list')) {
    if (!packs.length) { console.log('No packs found.'); process.exit(1); }
    console.log('\nPacks in your game folder:\n');
    show(packs);
    console.log('');
    process.exit(0);
  }

  let chosen = readChoices();

  if (args.includes('--pick')) {
    if (!packs.length) { console.log('No packs to choose from.'); process.exit(1); }
    chosen = await choose(packs);
  }

  // A pack named here that is no longer installed would silently fall back to
  // whatever the shot picks for itself, which looks like the choice being
  // ignored. Said out loud instead.
  const titles = new Set(packs.map((p) => p.title));
  for (const [key, title] of Object.entries(chosen)) {
    if (!titles.has(title)) {
      console.log(`The ${key} picture asks for "${title}", which is not installed.`);
      console.log('It will choose for itself. Run with --pick to change it.');
    }
  }

  const used = Object.entries(chosen).filter(([, v]) => v);
  if (used.length) {
    console.log('Using:');
    for (const [key, title] of used) console.log(`  ${key.padEnd(8)} ${title}`);
  }

  const child = spawn(electron, ['.'], {
    cwd: ROOT,
    env: { ...process.env, CVE_SHOTS: '1', CVE_SHOT_PACKS: JSON.stringify(chosen) },
    stdio: 'inherit',
  });

  child.on('exit', (code) => process.exit(code === null ? 1 : code));
})();
