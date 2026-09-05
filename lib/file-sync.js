const path = require('node:path');

function isSyncableScript(filename) {
  return /\.(?:lua|luau|ts|tsx)$/i.test(String(filename || ''));
}

function scriptClassForPath(relativePath) {
  const normalized = String(relativePath || '').replace(/\\/g, '/');
  if (/\.client\.(?:lua|luau|ts|tsx)$/i.test(normalized)) return 'LocalScript';
  if (/\.server\.(?:lua|luau|ts|tsx)$/i.test(normalized)) return 'Script';
  if (/^(?:StarterGui|StarterPack|StarterPlayer)(?:\/|$)/i.test(normalized)) return 'LocalScript';
  if (/^ServerScriptService(?:\/|$)/i.test(normalized)) return 'Script';
  return 'ModuleScript';
}

function buildStudioSyncCode(filename, source) {
  const normalized = String(filename || '').replace(/\\/g, '/').replace(/^src\//i, '');
  const pathParts = normalized.split('/').filter(Boolean);
  if (pathParts.length < 2) throw new Error('Chemin de script trop court');

  const serviceName = pathParts[0];
  const fileName = pathParts[pathParts.length - 1];
  const scriptName = fileName.replace(/\.(?:lua|luau|ts|tsx)$/i, '');
  const parentParts = pathParts.slice(1, -1);
  const scriptClass = scriptClassForPath(normalized);
  const q = value => JSON.stringify(String(value));

  const lines = [
    `local service = game:GetService(${q(serviceName)})`,
    'local parent = service',
  ];
  parentParts.forEach((part, index) => {
    lines.push(`local folder${index} = parent:FindFirstChild(${q(part)})`);
    lines.push(`if not folder${index} then`);
    lines.push(`  folder${index} = Instance.new("Folder")`);
    lines.push(`  folder${index}.Name = ${q(part)}`);
    lines.push(`  folder${index}.Parent = parent`);
    lines.push('end');
    lines.push(`parent = folder${index}`);
  });
  lines.push(`local target = parent:FindFirstChild(${q(scriptName)})`);
  lines.push('if target and not target:IsA("LuaSourceContainer") then error("Forge sync target is not a script") end');
  lines.push('if not target then');
  lines.push(`  target = Instance.new(${q(scriptClass)})`);
  lines.push(`  target.Name = ${q(scriptName)}`);
  lines.push('  target.Parent = parent');
  lines.push('end');
  lines.push('local source = ' + q(source));
  lines.push('local editor = game:GetService("ScriptEditorService")');
  lines.push('local updated, updateError = pcall(function()');
  lines.push('  editor:UpdateSourceAsync(target, function() return source end)');
  lines.push('end)');
  lines.push('if not updated then');
  lines.push('  local assigned, assignError = pcall(function() target.Source = source end)');
  lines.push('  if not assigned then error("Forge sync failed: " .. tostring(updateError) .. " / " .. tostring(assignError)) end');
  lines.push('end');
  lines.push('return "ForgeSyncOK"');

  return { relativePath: normalized, code: lines.join('\n'), scriptClass, scriptName };
}

function mcpToolResultError(result) {
  if (!result) return 'Réponse MCP vide';
  if (result.isError) return 'Le serveur MCP a refusé la synchronisation';
  for (const item of result.content || []) {
    if (!item || typeof item.text !== 'string') continue;
    try {
      const parsed = JSON.parse(item.text);
      if (parsed && (parsed.success === false || parsed.error)) {
        return String(parsed.error || parsed.message || 'Erreur Studio inconnue');
      }
    } catch (_) {}
  }
  return null;
}

module.exports = { isSyncableScript, scriptClassForPath, buildStudioSyncCode, mcpToolResultError };
