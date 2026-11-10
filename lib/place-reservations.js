const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');

class PlaceReservations {
  constructor(file) { this.file = file; this.owners = new Map(); this.publish(); }
  publish() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const temp = this.file + '.tmp';
    fs.writeFileSync(temp, JSON.stringify(Object.fromEntries([...this.owners].map(([id, owner]) => [id, {
      agentId: owner.agentId, agentName: owner.agentName,
      tokenHash: crypto.createHash('sha256').update(owner.token).digest('hex'),
    }]))));
    fs.renameSync(temp, this.file);
  }
  acquire(placeId, agentId, agentName) {
    const id = String(placeId);
    const current = this.owners.get(id);
    if (current) throw new Error(`PlaceId ${id} réservé par ${current.agentName}.`);
    const owner = { agentId: String(agentId), agentName: String(agentName), token: crypto.randomUUID() };
    this.owners.set(id, owner); this.publish(); return owner;
  }
  release(placeId, token) {
    const id = String(placeId);
    if (this.owners.get(id)?.token !== token) return false;
    this.owners.delete(id); this.publish(); return true;
  }
  owner(placeId) { return this.owners.get(String(placeId)) || null; }
  list() { return Object.fromEntries([...this.owners].map(([id, owner]) => [id, { agentId: owner.agentId, agentName: owner.agentName }])); }
}
module.exports = { PlaceReservations };
