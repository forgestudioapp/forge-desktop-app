const fs = require('node:fs');
const path = require('node:path');

function copyFileIfChanged(source, destination) {
  const sourceStat = fs.statSync(source);
  if (fs.existsSync(destination)) {
    const destinationStat = fs.statSync(destination);
    if (sourceStat.size === destinationStat.size) {
      const sourceBytes = fs.readFileSync(source);
      const destinationBytes = fs.readFileSync(destination);
      if (sourceBytes.equals(destinationBytes)) return { changed: false };
    }
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
  return { changed: true };
}

module.exports = { copyFileIfChanged };
