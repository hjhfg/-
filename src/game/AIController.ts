import { CARDS, type OpponentProfile } from '../data/cards';
import type { BuildingEntity, BuildPin, UnitEntity } from './BattleTypes';

export interface AIDecisionContext {
  aiGold: number;
  aiTechLevel: number;
  aiTechCost: number;
  elapsedSec: number;
  enemyPins: BuildPin[];
  enemyBuildings: BuildingEntity[];
  playerUnits: UnitEntity[];
  playerBuildings: BuildingEntity[];
  profile: OpponentProfile;
}

export class AIController {
  private nextThinkTime = 1.8;

  public reset(): void {
    this.nextThinkTime = 1.8;
  }

  public decide(
    ctx: AIDecisionContext
  ): { action: 'none' } | { action: 'build'; pin: BuildPin } | { action: 'tech' } {
    if (ctx.elapsedSec < this.nextThinkTime) {
      return { action: 'none' };
    }
    this.nextThinkTime = ctx.elapsedSec + 1.15 + Math.random() * 0.9;

    if (ctx.enemyPins.length === 0) return { action: 'none' };

    // Count AI's current economy & player's unit composition to actively counter-build!
    let aiMines = 0;
    let aiDefenses = 0;
    let aiUnitBuildings = 0;
    for (const b of ctx.enemyBuildings) {
      if (b.category === 'mine') aiMines++;
      else if (b.category === 'bunker_def' || b.category === 'aa_def' || b.category === 'laser_def') aiDefenses++;
      else if (!b.isCommandCenter) aiUnitBuildings++;
    }

    let playerAirCount = 0;
    let playerTankCount = 0;
    let playerInfantryCount = 0;
    let playerVehicleCount = 0;
    for (const u of ctx.playerUnits) {
      if (u.category === 'air') playerAirCount++;
      else if (u.category === 'tank') playerTankCount++;
      else if (u.category === 'infantry') playerInfantryCount++;
      else if (u.category === 'vehicle') playerVehicleCount++;
    }

    // Occasional tech upgrade once AI has solid base
    if (
      aiUnitBuildings >= 3 &&
      ctx.aiTechLevel < 5 &&
      ctx.aiGold >= ctx.aiTechCost + 40 &&
      Math.random() < 0.28
    ) {
      return { action: 'tech' };
    }

    // Score every available AI adjacent build pin
    let bestPin: BuildPin | null = null;
    let bestScore = -9999;

    for (const pin of ctx.enemyPins) {
      const card = CARDS[pin.cardId];
      if (!card) continue;
      let score = Math.random() * 14;

      // 1. Early economy priority (grab 2-3 mines like smart players!)
      if (card.slotType === 'mine') {
        if (aiMines < 2) score += 95;
        else if (aiMines < 4 && ctx.elapsedSec < 95) score += 45;
        else score += 10;
      }

      // 2. Smart Counter-Play based on what Player is fielding!
      if (playerAirCount >= 2 && card.counterCategories.includes('air')) {
        score += 55; // Build AA / Missile Car vs Player's Jetpack Troopers / Jets!
      }
      if (playerTankCount >= 2 && card.counterCategories.includes('tank')) {
        score += 52; // Build Air / Prism vs Player's Tanks!
      }
      if (playerVehicleCount >= 2 && card.counterCategories.includes('vehicle')) {
        score += 48; // Build Heavy Gunner vs Player's Missile/Artillery Cars!
      }
      if (playerInfantryCount >= 4 && card.counterCategories.includes('infantry')) {
        score += 50; // Build Bunker vs Player's Infantry swarm!
      }

      // 3. Forward expansion bias toward central battlefield (higher r for top AI)
      score += pin.r * 2.2;

      // Limit too many static defense towers so AI keeps attacking actively
      if (card.slotType === 'defense' && aiDefenses >= 2) {
        score -= 35;
      }

      if (score > bestScore) {
        bestScore = score;
        bestPin = pin;
      }
    }

    if (!bestPin) return { action: 'none' };

    // Wait briefly to save gold if chosen high-priority pin is close in price, else buy an affordable pin
    if (ctx.aiGold >= bestPin.cost) {
      return { action: 'build', pin: bestPin };
    }

    // If AI has plenty of gold (> 95), pick best currently affordable pin instead of stalling
    if (ctx.aiGold >= 95) {
      const affordable = ctx.enemyPins.filter((p) => p.cost <= ctx.aiGold);
      if (affordable.length > 0) {
        const chosen = affordable[Math.floor(Math.random() * affordable.length)];
        return { action: 'build', pin: chosen };
      }
    }

    return { action: 'none' };
  }
}
