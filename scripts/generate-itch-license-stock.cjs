// Generates PRIVATE matching SQL/itch.io files; never prints license keys.
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const count = Number(process.argv[2] || 100);
if (!Number.isSafeInteger(count) || count < 1 || count > 10000) throw new Error('Count must be 1–10000');
const batch = `itch-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
const output = path.resolve(__dirname, '..', '.private-licenses', batch);
fs.mkdirSync(output, { recursive: true });
const keys = Array.from({ length: count }, () => randomUUID().toUpperCase());
fs.writeFileSync(path.join(output, 'itch-keys.txt'), keys.join('\n') + '\n', { flag: 'wx', mode: 0o600 });
const values = keys.map(key => `('${key}', 'active', 'pro', '{"source":"itch_external","batch":"${batch}"}'::jsonb)`).join(',\n');
fs.writeFileSync(path.join(output, 'import.sql'), `begin;\ninsert into public.license_keys (license_key,status,plan,metadata) values\n${values}\non conflict (license_key) do nothing;\nselect count(*) as imported_keys from public.license_keys where metadata->>'batch' = '${batch}';\ncommit;\n`, { flag: 'wx', mode: 0o600 });
fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify({ batch, count, createdAt: new Date().toISOString() }, null, 2));
console.log(JSON.stringify({ output, batch, count }));
