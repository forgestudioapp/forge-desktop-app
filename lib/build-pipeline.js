'use strict';
const crypto = require('node:crypto');

function candidateBuildId(files, language = 'lua') {
  const hash = crypto.createHash('sha256').update(String(language));
  for (const [name, source] of [...files].sort(([a], [b]) => a.localeCompare(b))) {
    hash.update('\0').update(name).update('\0').update(source);
  }
  return hash.digest('hex').slice(0, 20);
}

function compileErrorFile(output) {
  const match = String(output || '').match(/(?:^|\s|\()((?:[A-Za-z]:[\\/])?[^\r\n():]+\.tsx?)(?::\d+|\(\d+)/im);
  return match ? match[1].trim() : null;
}

async function runCandidateSync({ jobs, validationJobs = jobs, buildId, transactionId, validate, checkPlace, apply, confirm }) {
  const place = await checkPlace();
  if (place?.error) return { phase: 'waiting-studio', error: place.error };
  for (const job of validationJobs) {
    if (job.deleted) continue;
    let result;
    try { result = await validate(job.filename, job.source, job); }
    catch (error) { return { phase: 'waiting-studio', error: `Connexion MCP interrompue pendant la validation : ${error.message || String(error)}` }; }
    if (result?.error) return result.kind === 'transport'
      ? { phase: 'waiting-studio', error: result.error }
      : { phase: 'compile-error', error: result.error, file: job.filename };
  }
  try {
    const result = await apply(jobs, place.placeId, buildId, transactionId);
    if (result?.error) {
      const confirmed = await confirm(buildId, place.placeId, transactionId).catch(() => false);
      return confirmed ? { phase: 'synced' } : { phase: 'waiting-studio', error: result.error };
    }
  } catch (error) {
    // The tool may have finished in Studio after its response was interrupted.
    const confirmed = await confirm(buildId, place.placeId, transactionId).catch(() => false);
    return confirmed ? { phase: 'synced' } : { phase: 'waiting-studio', error: error.message };
  }
  const confirmed = await confirm(buildId, place.placeId, transactionId).catch(() => false);
  return confirmed ? { phase: 'synced' } : { phase: 'waiting-studio', error: 'Confirmation Studio indisponible' };
}

module.exports = { candidateBuildId, compileErrorFile, runCandidateSync };
