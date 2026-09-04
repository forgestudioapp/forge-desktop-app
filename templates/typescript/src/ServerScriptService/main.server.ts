import { Players } from "@rbxts/services";

print("[Forge] Projet TypeScript charge !");

Players.PlayerAdded.Connect((player) => {
    print(`[Forge] ${player.Name} connecte !`);
});
