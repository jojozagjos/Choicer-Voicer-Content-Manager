'use strict';

/**
 * Checks the record validator, mostly against input designed to get past it.
 *
 *   node scripts/test-directory.js
 *
 * Plain Node, no framework, so it runs anywhere the app builds. Every case that
 * should be refused says why it matters, because a check nobody understands is
 * a check somebody later deletes.
 */

const path = require('path');
const {
  validateRecord, validateIndex, isReservedHandle, LIMITS,
  safeEntryPath, checkArchiveShape, ARCHIVE_LIMITS, ownerOfDownload,
} = require('../src/main/directory');

let failures = 0;
let checks = 0;

function check(label, condition, detail) {
  checks++;
  if (condition) return;
  failures++;
  console.log(`  FAIL  ${label}${detail ? `\n        ${detail}` : ''}`);
}

/** A record that should pass, so each case can change one thing. */
function good(overrides = {}) {
  return {
    id: 'jerma-meat-grinder',
    type: 'voice',
    title: 'Jerma Meat Grinder',
    summary: 'Three lines from the bit about the meat grinder.',
    description: 'Recorded properly, with pictures.',
    author: 'jojozagjos',
    licence: 'cc-by',
    tags: ['funny', 'short'],
    // The account here has to match the author above, or every record built from
    // this fixture is refused for impersonating someone.
    downloadUrl: 'https://github.com/jojozagjos/packs/releases/download/v1/pack.zip',
    sha256: 'a'.repeat(64),
    bytes: 4_200_000,
    published: '2026-07-01T12:00:00.000Z',
    ...overrides,
  };
}

const refused = (overrides, field) => {
  const result = validateRecord(good(overrides));
  return !result.ok && result.problems.some((p) => p.field === field);
};

console.log('\nAccepting what should be accepted');
{
  const result = validateRecord(good());
  check('a complete record passes', result.ok,
    result.ok ? '' : JSON.stringify(result.problems));
  check('unknown fields are dropped',
    validateRecord(good({ evil: 'payload' })).record.evil === undefined);
  check('tags come back sorted',
    validateRecord(good({ tags: ['zebra', 'apple'] })).record.tags[0] === 'apple');
  check('updated defaults to published',
    validateRecord(good()).record.updated === validateRecord(good()).record.published);
  check('a description is optional', validateRecord(good({ description: undefined })).ok);
}

console.log('\nDownload links');
{
  // The installer follows this link. Anything it can be aimed at, it will be.
  check('http is refused', refused({ downloadUrl: 'http://github.com/a/b.zip' }, 'downloadUrl'));
  check('file:// is refused', refused({ downloadUrl: 'file:///C:/Windows/System32' }, 'downloadUrl'));
  check('localhost is refused', refused({ downloadUrl: 'https://localhost/pack.zip' }, 'downloadUrl'));
  check('a private address is refused',
    refused({ downloadUrl: 'https://192.168.1.1/pack.zip' }, 'downloadUrl'));
  check('an unknown host is refused',
    refused({ downloadUrl: 'https://totally-not-malware.example/pack.zip' }, 'downloadUrl'));
  check('credentials in the link are refused',
    refused({ downloadUrl: 'https://user:pw@github.com/a/b.zip' }, 'downloadUrl'));
  // A host that merely ends with an allowed name, which is the usual way past a
  // naive check: "github.com.evil.example".
  check('a lookalike host is refused',
    refused({ downloadUrl: 'https://github.com.evil.example/pack.zip' }, 'downloadUrl'));
  check('a subdomain of an allowed host passes',
    validateRecord(good({ downloadUrl: 'https://dl.dropboxusercontent.com/s/x/pack.zip' })).ok);

  // Hosts that would pass a safety check and then fail at install time, because
  // they answer with a page rather than the file.
  for (const host of ['drive.google.com', 'mega.nz', 'www.mediafire.com', 'user.itch.io']) {
    check(`${host} is refused, it does not serve the file directly`,
      refused({ downloadUrl: `https://${host}/pack.zip` }, 'downloadUrl'));
  }
}

console.log('\nHandles');
{
  check('admin is reserved', isReservedHandle('admin'));
  check('numbers standing in for letters are caught', isReservedHandle('adm1n'));
  check('full width characters are caught', isReservedHandle('ａdmin'));
  check('padding is caught', isReservedHandle('_admin_'));
  check('a normal handle is fine', !isReservedHandle('jojozagjos'));
  check('a reserved author is refused', refused({ author: 'moderator' }, 'author'));
  check('a handle with a slash is refused', refused({ author: 'a/b' }, 'author'));
  check('a one character handle is refused', refused({ author: 'a' }, 'author'));
}

console.log('\nText fields');
{
  check('an over long title is refused',
    refused({ title: 'x'.repeat(LIMITS.title + 1) }, 'title'));
  check('a blank title is refused', refused({ title: '   ' }, 'title'));
  // Right-to-left overrides can make a displayed name read as something else.
  check('a direction override is refused', refused({ title: 'pack\u202Egpj.exe' }, 'title'));
  check('a control character is refused', refused({ summary: 'a\u0000b' }, 'summary'));
  check('a non-string title is refused', refused({ title: 42 }, 'title'));
}

console.log('\nChecksums and sizes');
{
  check('a missing checksum is refused', refused({ sha256: undefined }, 'sha256'));
  check('a short checksum is refused', refused({ sha256: 'abc' }, 'sha256'));
  check('a non-hex checksum is refused', refused({ sha256: 'z'.repeat(64) }, 'sha256'));
  check('checksums are stored lower case',
    validateRecord(good({ sha256: 'A'.repeat(64) })).record.sha256 === 'a'.repeat(64));
  check('zero bytes is refused', refused({ bytes: 0 }, 'bytes'));
  check('a negative size is refused', refused({ bytes: -1 }, 'bytes'));
  check('a fractional size is refused', refused({ bytes: 1.5 }, 'bytes'));
  check('an absurd size is refused', refused({ bytes: LIMITS.bytes + 1 }, 'bytes'));
}

console.log('\nEnumerations');
{
  check('an unknown type is refused', refused({ type: 'malware' }, 'type'));
  check('an unknown licence is refused', refused({ licence: 'whatever' }, 'licence'));
  check('too many tags are refused',
    refused({ tags: Array.from({ length: 20 }, (_, i) => `t${i}`) }, 'tags'));
  check('a duplicate tag is refused', refused({ tags: ['a', 'a'] }, 'tags'));
  check('a tag with punctuation is refused', refused({ tags: ['no spaces!'] }, 'tags'));
}

console.log('\nNot an object at all');
{
  for (const junk of [null, undefined, 42, 'a string', [], true]) {
    check(`${JSON.stringify(junk)} is refused`, !validateRecord(junk).ok);
  }
}

console.log('\nThe index');
{
  const index = validateIndex({
    packs: [good(), good({ id: 'second' }), good({ id: 'bad', sha256: 'nope' }), good()],
  });
  check('good records are kept', index.packs.length === 2, `kept ${index.packs.length}`);
  check('a bad record is dropped, not fatal', index.ok);
  check('the bad record is reported', index.rejected.some((r) => r.id === 'bad'));
  check('a duplicate id is dropped', index.rejected.some(
    (r) => r.problems.some((p) => p.message === 'duplicate id')
  ));
  check('junk is not an index', !validateIndex({ nope: true }).ok);
  check('an empty index is fine', validateIndex({ packs: [] }).ok);
}

console.log('\nWhere an archive entry is allowed to land');
{
  const into = path.resolve('C:/games/packs/mypack');
  const allowed = (name) => safeEntryPath(into, name).ok;

  // The ordinary cases first, so a check that refuses everything is caught.
  check('a plain file is allowed', allowed('dub_video.ogv'));
  check('a file in a subfolder is allowed', allowed('clips/01_line.wav'));
  check('a config is allowed', allowed('config_menu.json'));

  // Then the reason this function exists.
  check('going up is refused', !allowed('../evil.wav'));
  check('going a long way up is refused', !allowed('../../../../Windows/System32/evil.wav'));
  check('going up mid-path is refused', !allowed('clips/../../evil.wav'));
  check('a Windows absolute path is refused', !allowed('C:/Windows/System32/evil.wav'));
  check('a unix absolute path is refused', !allowed('/etc/passwd'));
  check('a UNC path is refused', !allowed('//server/share/evil.wav'));
  check('backslash separators are understood',
    !allowed('..\\..\\Windows\\System32\\evil.wav'));
  check('a null byte is refused', !allowed('ok.wav\u0000.exe'));

  // A sibling folder whose name merely starts the same must not pass. This is
  // the classic mistake in a naive startsWith check.
  check('a sibling with a shared prefix is refused',
    !safeEntryPath('C:/games/packs/my', '../mypack-evil/x.wav').ok);

  // Nothing executable, whatever it is called.
  check('an exe is refused', !allowed('installer.exe'));
  check('a batch file is refused', !allowed('run.bat'));
  check('a dll is refused', !allowed('payload.dll'));
  check('a shell script is refused', !allowed('setup.sh'));
  check('an extension in capitals is still refused', !allowed('EVIL.EXE'));
  check('no extension is refused', !allowed('README'));

  // Windows device names are not ordinary files.
  check('a device name is refused', !allowed('CON.wav'));
  check('a device name in a folder is refused', !allowed('clips/nul.wav'));

  check('too deep is refused', !allowed('a/b/c/d/e/f/g/h/deep.wav'));
  check('an empty name is refused', !allowed(''));
  check('a non-string name is refused', !safeEntryPath(into, null).ok);

  // And that a refusal explains itself, since these end up in front of a person.
  check('a refusal says why', /escapes the folder/.test(safeEntryPath(into, '../x.wav').reason));
}

console.log('\nThe shape of an archive');
{
  const entry = (over = {}) => ({
    name: 'a.wav', uncompressedSize: 1000, compressedSize: 500, isSymlink: false, ...over,
  });

  check('an ordinary archive passes', checkArchiveShape([entry(), entry()]).ok);
  check('too many files is refused',
    !checkArchiveShape(Array.from({ length: ARCHIVE_LIMITS.entries + 1 }, () => entry())).ok);
  check('a zip bomb ratio is refused',
    !checkArchiveShape([entry({ uncompressedSize: 1e9, compressedSize: 1000 })]).ok);
  check('an oversized total is refused',
    !checkArchiveShape([entry({ uncompressedSize: ARCHIVE_LIMITS.totalBytes + 1, compressedSize: 1e8 })]).ok);
  check('a symlink is refused', !checkArchiveShape([entry({ isSymlink: true })]).ok);
  check('junk is refused', !checkArchiveShape('not an archive').ok);
}

console.log('\nThe author has to own the file');

{
  const at = (url) => `https://github.com/${url}`;

  check('a pack hosted by its author passes',
    validateRecord(good({
      author: 'jojozagjos',
      downloadUrl: at('jojozagjos/packs/releases/download/v1/p.zip'),
    })).ok);

  // Handles themselves must be lowercase, enforced elsewhere. The case that can
  // vary is the address: GitHub serves the same account at any capitalisation,
  // so a link copied from the browser can arrive with the owner mixed case.
  check('a mixed-case owner in the address still matches',
    validateRecord(good({
      author: 'jojozagjos',
      downloadUrl: at('JoJoZagjos/packs/releases/download/v1/p.zip'),
    })).ok,
    'GitHub is not case sensitive about account names, so this must not be either');

  const impostor = validateRecord(good({
    author: 'jojozagjos',
    downloadUrl: at('someoneelse/packs/releases/download/v1/p.zip'),
  }));
  check('claiming someone else\'s name is refused', !impostor.ok);
  check('  and the problem is on the author field',
    impostor.problems.some((p) => p.field === 'author'),
    JSON.stringify(impostor.problems));

  check('gitlab is checked the same way',
    !validateRecord(good({
      author: 'jojozagjos',
      downloadUrl: 'https://gitlab.com/notthem/packs/-/releases/v1/p.zip',
    })).ok);

  check('codeberg is checked the same way',
    !validateRecord(good({
      author: 'jojozagjos',
      downloadUrl: 'https://codeberg.org/notthem/packs/releases/download/v1/p.zip',
    })).ok);

  // Dropbox has no owner in the path, so there is nothing to compare against.
  // Refusing here would be pretending to a check that was never made.
  check('a host with no owner in the address is left to the submitter',
    validateRecord(good({
      author: 'jojozagjos',
      downloadUrl: 'https://dropbox.com/scl/fi/abc/p.zip?dl=1',
    })).ok);

  check('ownerOfDownload reads github',
    ownerOfDownload(at('someone/repo/releases/download/v1/p.zip')) === 'someone');
  check('ownerOfDownload returns nothing for an ownerless host',
    ownerOfDownload('https://objects.githubusercontent.com/abc/def') === null);
  check('ownerOfDownload survives nonsense',
    ownerOfDownload('not a url') === null);
  check('ownerOfDownload survives a bare host',
    ownerOfDownload('https://github.com/') === null);
}

console.log('\nIcons, and the swap they are meant to stop');
{
  const iconUrl = 'https://github.com/jojozagjos/packs/releases/download/v1/p-icon.png';

  check('a record with no icon is fine', validateRecord(good()).ok);
  check('and reports the absence as null rather than leaving it out',
    validateRecord(good()).record.iconUrl === null
    && validateRecord(good()).record.iconSha256 === null);

  check('an icon with its hash is accepted',
    validateRecord(good({ iconUrl, iconSha256: 'b'.repeat(64) })).ok);

  // The whole point. An address alone proves nothing, because the bytes behind
  // a release asset can be replaced at any time without the address changing.
  check('an icon without a hash is refused',
    refused({ iconUrl }, 'iconSha256'),
    'an unhashable icon can be swapped for anything after a pack is accepted');
  check('an icon with a malformed hash is refused',
    refused({ iconUrl, iconSha256: 'nope' }, 'iconSha256'));

  check('an icon hosted somewhere packs cannot come from is refused',
    refused({ iconUrl: 'https://evil.example/p.png', iconSha256: 'b'.repeat(64) }, 'iconUrl'));

  check('an icon on somebody else\'s account is refused',
    refused({
      iconUrl: 'https://github.com/someoneelse/packs/releases/download/v1/p-icon.png',
      iconSha256: 'b'.repeat(64),
    }, 'iconUrl'));

  check('the hash is stored lower case, like the pack\'s',
    validateRecord(good({ iconUrl, iconSha256: 'B'.repeat(64) })).record.iconSha256
      === 'b'.repeat(64));
}

console.log('\nUnlisting has to survive being validated');
{
  const hidden = validateIndex({ packs: [{ ...good(), listed: false }] });
  check('a hidden pack stays hidden', hidden.packs[0].listed === false,
    'this is what made unlisting do nothing at all');
  check('an ordinary pack is listed', validateIndex({ packs: [good()] }).packs[0].listed === true);
  check('a submission cannot arrive claiming to be hidden',
    validateRecord(good({ listed: false })).record.listed === true);
}

console.log(`\n${checks - failures}/${checks} passed`);
if (failures) {
  console.log(`${failures} FAILED`);
  process.exit(1);
}
