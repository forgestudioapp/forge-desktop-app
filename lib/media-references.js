const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

// Validate the whole selection before writing anything or launching a paid job.
function importMediaReferences(projectPath, referencePaths = []) {
  if (!Array.isArray(referencePaths) || referencePaths.length > 4) throw new Error('Choisis au maximum 4 images de référence.');
  const references = [...new Set(referencePaths)].map(file => {
    if (typeof file !== 'string' || !path.isAbsolute(file)) throw new Error('Image de référence invalide.');
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size > 20 * 1024 * 1024) throw new Error('Chaque référence doit être une image de moins de 20 Mo.');
    const bytes = fs.readFileSync(file);
    const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const jpg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    const webp = bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP';
    if (!png && !jpg && !webp) throw new Error('Références acceptées : PNG, JPEG et WebP.');
    const hash = createHash('sha256').update(bytes).digest('hex');
    return { bytes, name: hash + (png ? '.png' : jpg ? '.jpg' : '.webp') };
  });
  if (!references.length) return [];
  const folder = path.join(projectPath, '.forge-media-references');
  fs.mkdirSync(folder, { recursive: true });
  return [...new Set(references.map(({ bytes, name }) => {
    const target = path.join(folder, name);
    if (!fs.existsSync(target)) fs.writeFileSync(target, bytes, { flag: 'wx' });
    return target;
  }))];
}

module.exports = { importMediaReferences };
