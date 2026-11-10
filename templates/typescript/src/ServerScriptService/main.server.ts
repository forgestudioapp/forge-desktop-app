const Players = game.GetService("Players");

print("[Forge] Projet TypeScript charge !");

Players.PlayerAdded.Connect((player) => {
    print(`[Forge] ${player.Name} connecte !`);
});
