import { hideoutBonusConfig } from '../../shared/config/hideout-bonus'

export type CraftBonusCalc = {
  baseAmount: number
  bonusChance: number
  bonusUnitsOnProc: number
  expectedBonusAmount: number
  expectedTotalAmount: number
}

export function calculateLevelBonus(baseAmount: number): CraftBonusCalc {
  const bonusChance = hideoutBonusConfig.bonusCraftChanceAtLevel5
  const bonusUnitsOnProc = hideoutBonusConfig.bonusExtraUnitsPerProc
  const expectedBonusAmount = bonusChance * bonusUnitsOnProc

  return {
    baseAmount,
    bonusChance,
    bonusUnitsOnProc,
    expectedBonusAmount,
    expectedTotalAmount: baseAmount + expectedBonusAmount,
  }
}
