function correctionResult(response) {
  if (response?.isError) throw new Error(response.content?.[0]?.text || 'Échec correction Blender');
  const envelope = JSON.parse(response?.content?.[0]?.text || '{}');
  const result = envelope.result;
  if (!envelope.ok || !result || typeof result !== 'object') throw new Error('Résultat de correction Blender absent');
  if (!Array.isArray(result.errors) || !Array.isArray(result.applied)) throw new Error('Résultat de correction incomplet');
  if (result.errors.length) throw new Error('Erreurs de correction: ' + result.errors.map(e => `${e.type}/${e.object}: ${e.error}`).join('; '));
  if (!result.applied.length) throw new Error('Aucune correction appliquée');
  return result;
}
module.exports = { correctionResult };
