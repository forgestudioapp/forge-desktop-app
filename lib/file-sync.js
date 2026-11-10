const path = require('node:path');

function isSyncableScript(filename) {
  return /\.(?:lua|luau|ts|tsx)$/i.test(String(filename || ''));
}

function scriptClassForPath(relativePath) {
  const normalized = String(relativePath || '').replace(/\\/g, '/');
  if (/\.client\.(?:lua|luau|ts|tsx)$/i.test(normalized)) return 'LocalScript';
  if (/\.server\.(?:lua|luau|ts|tsx)$/i.test(normalized)) return 'Script';
  if (/^ServerScriptService\/ForgeModules\/[^/]+\.(?:lua|luau|ts|tsx)$/i.test(normalized)) return 'ModuleScript';
  if (/^(?:StarterGui|StarterPack|StarterPlayer)(?:\/|$)/i.test(normalized)) return 'LocalScript';
  if (/^ServerScriptService(?:\/|$)/i.test(normalized)) return 'Script';
  return 'ModuleScript';
}

function placeGuard(expectedPlaceId) {
  if (!/^\d+$/.test(String(expectedPlaceId || '')) || String(expectedPlaceId) === '0') throw new Error('PlaceId attendu invalide');
  return `if tostring(game.PlaceId) ~= ${JSON.stringify(String(expectedPlaceId))} then error("Forge: PlaceId différent, synchronisation bloquée") end`;
}

function buildStudioValidationCode(filename, source) {
  return [
    'local temporary = Instance.new("ModuleScript")',
    'temporary.Name = "__ForgeSyntaxCheck"',
    'temporary.Parent = game:GetService("ServerStorage")',
    `local source = ${JSON.stringify(`return function()\n${String(source)}\nend`)}`,
    'local written, writeError = pcall(function() game:GetService("ScriptEditorService"):UpdateSourceAsync(temporary, function() return source end) end)',
    'if not written then temporary:Destroy() error("Forge syntax check unavailable: " .. tostring(writeError)) end',
    'local valid, syntaxError = pcall(function() return require(temporary) end)',
    'temporary:Destroy()',
    `if not valid then error("Forge: " .. ${JSON.stringify(String(filename))} .. ": " .. tostring(syntaxError)) end`,
    'return "ForgeValidationOK"',
  ].join('\n');
}

function buildStudioBatchCode(jobs, expectedPlaceId, buildId, transactionId) {
  const guard = placeGuard(expectedPlaceId);
  if (!/^[a-f0-9]{20}$/.test(String(buildId))) throw new Error('Identifiant de version invalide');
  if (!/^[a-f0-9]{20}$/.test(String(transactionId))) throw new Error('Identifiant de transaction invalide');
  const entries = jobs.map(job => {
    const normalized = String(job.filename || '').replace(/\\/g, '/').replace(/^src\//i, '');
    const parts = normalized.split('/');
    if (parts.length < 2 || parts.some(part => !part || part === '.' || part === '..') || !/\.luau?$/i.test(parts.at(-1))) throw new Error('Chemin de script invalide');
    return `{path=${JSON.stringify(normalized)}, parts={${parts.map(part => JSON.stringify(part)).join(',')}}, source=${job.deleted ? 'nil' : JSON.stringify(String(job.source))}, class=${JSON.stringify(scriptClassForPath(normalized))}}`;
  });
  return [
    guard,
    `local jobs = {${entries.join(',')}}`,
    'local editor = game:GetService("ScriptEditorService")',
    'for _, job in ipairs(jobs) do',
    '  if job.source ~= nil then',
    '    local temporary = Instance.new("ModuleScript")',
    '    temporary.Name = "__ForgeSyntaxCheck"',
    '    temporary.Parent = game:GetService("ServerStorage")',
    '    local written, writeError = pcall(function() editor:UpdateSourceAsync(temporary, function() return "return function()\\n" .. job.source .. "\\nend" end) end)',
    '    if not written then temporary:Destroy() error("Forge syntax check unavailable: " .. tostring(writeError)) end',
    '    local valid, syntaxError = pcall(function() return require(temporary) end)',
    '    temporary:Destroy()',
    '    if not valid then error(job.path .. ": " .. tostring(syntaxError)) end',
    '  end',
    'end',
    'local rollback = {}',
    'local removed = {}',
    'local function remember(undo) table.insert(rollback, 1, undo) end',
    'local ok, applyError = pcall(function()',
    '  for _, job in ipairs(jobs) do',
    `    ${guard}`,
    '    local parent = game:GetService(job.parts[1])',
    '    for index = 2, #job.parts - 1 do',
    '      local folder = parent:FindFirstChild(job.parts[index])',
    '      if not folder and job.source ~= nil then',
    '        folder = Instance.new("Folder")',
    '        folder.Name = job.parts[index]',
    '        folder.Parent = parent',
    '        local createdFolder = folder',
    '        remember(function() createdFolder:Destroy() end)',
    '      end',
    '      if not folder then parent = nil break end',
    '      parent = folder',
    '    end',
    '    if parent then',
    '      local name = job.parts[#job.parts]:gsub("%.luau?$", "")',
    '      local target = parent:FindFirstChild(name)',
    '      if target and not target:IsA("LuaSourceContainer") then error(job.path .. ": cible non script") end',
    '      if job.source == nil then',
    '        if target and target:GetAttribute("ForgeSyncSource") == job.path then',
    '          local previousParent = target.Parent',
    '          target.Parent = nil',
    '          remember(function() target.Parent = previousParent end)',
    '          table.insert(removed, target)',
    '        end',
    '      else',
    '        local previousSource = nil',
    '        if not target then',
    '          target = Instance.new(job.class)',
    '          target.Name = name',
    '          target.Parent = parent',
    '          local createdTarget = target',
    '          remember(function() createdTarget:Destroy() end)',
    '        else',
    '          previousSource = target.Source',
    '          local previousTag = target:GetAttribute("ForgeSyncSource")',
    '          local oldTarget = target',
    '          remember(function()',
    '            local restored = pcall(function()',
    '              editor:UpdateSourceAsync(oldTarget, function() return previousSource end)',
    '            end)',
    '            if not restored then oldTarget.Source = previousSource end',
    '            oldTarget:SetAttribute("ForgeSyncSource", previousTag)',
    '          end)',
    '        end',
    '        editor:UpdateSourceAsync(target, function(currentSource)',
    '          if previousSource ~= nil then previousSource = currentSource end',
    `          ${guard}`,
    '          return job.source',
    '        end)',
    '        target:SetAttribute("ForgeSyncSource", job.path)',
    '      end',
    '    end',
    '  end',
    `  ${guard}`,
    '  local previousBuild = game:GetAttribute("ForgeSyncBuildId")',
    '  local previousTransaction = game:GetAttribute("ForgeSyncTransactionId")',
    '  remember(function()',
    '    game:SetAttribute("ForgeSyncBuildId", previousBuild)',
    '    game:SetAttribute("ForgeSyncTransactionId", previousTransaction)',
    '  end)',
    `  game:SetAttribute("ForgeSyncBuildId", ${JSON.stringify(buildId)})`,
    `  game:SetAttribute("ForgeSyncTransactionId", ${JSON.stringify(transactionId)})`,
    'end)',
    'if not ok then',
    '  local rollbackErrors = {}',
    '  for _, undo in ipairs(rollback) do',
    '    local restored, restoreError = pcall(undo)',
    '    if not restored then table.insert(rollbackErrors, tostring(restoreError)) end',
    '  end',
    '  error("Forge sync: " .. tostring(applyError) .. (" ; rollback: " .. table.concat(rollbackErrors, "; ")))',
    'end',
    'for _, target in ipairs(removed) do target:Destroy() end',
    'return "ForgeSyncBatchOK"',
  ].join('\n');
}

function buildStudioConfirmationCode(expectedPlaceId) {
  return `${placeGuard(expectedPlaceId)}\nreturn tostring(game:GetAttribute("ForgeSyncBuildId") or "") .. ":" .. tostring(game:GetAttribute("ForgeSyncTransactionId") or "")`;
}

function buildStudioSyncCode(filename, source, expectedPlaceId) {
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
    placeGuard(expectedPlaceId),
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
  lines.push('  editor:UpdateSourceAsync(target, function()');
  lines.push('    ' + placeGuard(expectedPlaceId));
  lines.push('    return source');
  lines.push('  end)');
  lines.push('end)');
  lines.push('if not updated then');
  lines.push(placeGuard(expectedPlaceId));
  lines.push('  local assigned, assignError = pcall(function() target.Source = source end)');
  lines.push('  if not assigned then error("Forge sync failed: " .. tostring(updateError) .. " / " .. tostring(assignError)) end');
  lines.push('end');
  lines.push(`target:SetAttribute("ForgeSyncSource", ${q(normalized)})`);
  lines.push('return "ForgeSyncOK"');

  return { relativePath: normalized, code: lines.join('\n'), scriptClass, scriptName };
}

function buildStudioDeleteCode(filename, expectedPlaceId) {
  const normalized = String(filename || '').replace(/\\/g, '/').replace(/^src\//i, '');
  const parts = normalized.split('/').filter(Boolean);
  if (parts.length < 2 || !/\.luau?$/i.test(parts[parts.length - 1])) throw new Error('Chemin de script invalide');
  const q = value => JSON.stringify(String(value));
  const scriptName = parts[parts.length - 1].replace(/\.luau?$/i, '');
  const lines = [placeGuard(expectedPlaceId), `local parent = game:GetService(${q(parts[0])})`];
  for (const part of parts.slice(1, -1)) {
    lines.push(`parent = parent:FindFirstChild(${q(part)})`);
    lines.push('if not parent then return "ForgeSyncAlreadyRemoved" end');
  }
  lines.push(`local target = parent:FindFirstChild(${q(scriptName)})`);
  lines.push(`if target and target:IsA("LuaSourceContainer") and target:GetAttribute("ForgeSyncSource") == ${q(normalized)} then target:Destroy() end`);
  lines.push('return "ForgeSyncDeleteOK"');
  return { relativePath: normalized, code: lines.join('\n') };
}

function mcpToolResultError(result) {
  if (!result) return 'Réponse MCP vide';
  for (const item of result.content || []) {
    if (!item || typeof item.text !== 'string') continue;
    try {
      const parsed = JSON.parse(item.text);
      if (parsed && (parsed.success === false || parsed.error)) {
        return String(parsed.error || parsed.message || 'Erreur Studio inconnue');
      }
    } catch (_) {}
    if (result.isError && item.text.trim()) return item.text.trim();
  }
  if (result.isError) return 'Le serveur MCP a refusé la synchronisation';
  return null;
}

module.exports = {
  isSyncableScript,
  scriptClassForPath,
  buildStudioSyncCode,
  buildStudioValidationCode,
  buildStudioBatchCode,
  buildStudioConfirmationCode,
  buildStudioDeleteCode,
  mcpToolResultError,
};
