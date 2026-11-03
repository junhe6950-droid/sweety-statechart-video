# Catch

TLC reached 88 states and 132 steps. The chart draws 23 states and 21 arrows.
The chart does not draw 8 steps that stay in one chart state.
The step most of the booster's engines cut off changes The booster and The ship at the same time.
The step the ship pulls away changes The booster and The ship at the same time.
The step it hits the tower changes The booster and The tower at the same time.
The step the arms catch it changes The booster and The tower at the same time.

## HeadsForTowerOnlyWhenGo breaks
The shortest path has 5 steps:
0. The booster Filling with propellant, The ship Riding on top, The tower Arms open, waiting
1. the count reaches zero: The booster Lifting off, The ship Riding on top, The tower Arms open, waiting
2. the air presses hardest: The booster Through max Q, The ship Riding on top, The tower Arms open, waiting
3. most of the booster's engines cut off: The booster Hot staging, The ship Engines lit while attached, The tower Arms open, waiting
4. the ship pulls away: The booster Flipping, burning back, The ship Flying on to space, The tower Arms open, waiting
5. a check fails, it comes in anyway [no go/no-go poll]: The booster Coming in on a failed check, The ship Flying on to space, The tower Arms open, waiting

## TowerNeverHit breaks
The shortest path has 7 steps:
0. The booster Filling with propellant, The ship Riding on top, The tower Arms open, waiting
1. the count reaches zero: The booster Lifting off, The ship Riding on top, The tower Arms open, waiting
2. the air presses hardest: The booster Through max Q, The ship Riding on top, The tower Arms open, waiting
3. most of the booster's engines cut off: The booster Hot staging, The ship Engines lit while attached, The tower Arms open, waiting
4. the ship pulls away: The booster Flipping, burning back, The ship Flying on to space, The tower Arms open, waiting
5. a check fails, it comes in anyway [no go/no-go poll]: The booster Coming in on a failed check, The ship Flying on to space, The tower Arms open, waiting
6. the arms close: The booster Coming in on a failed check, The ship Flying on to space, The tower Arms closing
7. it hits the tower: The booster Hits the tower, The ship Flying on to space, The tower Damaged

## Rules that hold
TypeOK, ArmsCloseOnlyOnBooster, ShipFreeBeforeTurningBack, NoDeadlock
