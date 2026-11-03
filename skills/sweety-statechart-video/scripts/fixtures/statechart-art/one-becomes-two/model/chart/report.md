# CellCycle

TLC reached 61 states and 77 steps. The chart draws 21 states and 28 arrows.
The chart does not draw 9 steps that stay in one chart state.

## NeverCopiesDamagedDNA breaks
The shortest path has 2 steps:
0. Getting ready (interphase) / Growing (G1)
1. the DNA is damaged [p53 broken]: Getting ready (interphase) / Damaged, and p53 is broken
2. copies it anyway: Getting ready (interphase) / Copying damaged DNA

## SeparatesOnlyWhenAllCaught breaks
The shortest path has 6 steps:
0. Getting ready (interphase) / Growing (G1)
1. passes the first check: Getting ready (interphase) / Copying its DNA (S)
2. the copy is done: Getting ready (interphase) / Checking the copy (G2)
3. passes the second check: Dividing (mitosis) / Coiling up (prophase)
4. the nucleus opens: Dividing (mitosis) / The spindle reaches in (prometaphase)
5. fibres catch some [check broken]: Dividing (mitosis) / Some caught, the check is broken
6. pulled apart anyway: Dividing (mitosis) / Pulled apart too soon

## EachDaughterGetsOneOfEach breaks
The shortest path has 9 steps:
0. Getting ready (interphase) / Growing (G1)
1. passes the first check: Getting ready (interphase) / Copying its DNA (S)
2. the copy is done: Getting ready (interphase) / Checking the copy (G2)
3. passes the second check: Dividing (mitosis) / Coiling up (prophase)
4. the nucleus opens: Dividing (mitosis) / The spindle reaches in (prometaphase)
5. fibres catch some [check broken]: Dividing (mitosis) / Some caught, the check is broken
6. pulled apart anyway: Dividing (mitosis) / Pulled apart too soon
7. two nuclei form: Dividing (mitosis) / Two nuclei form (telophase)
8. the cell pinches: Dividing (mitosis) / Pinching in two (cytokinesis)
9. splits, chromosomes uneven: Two cells with the wrong chromosomes

## DaughtersCarryNoMutation breaks
The shortest path has 11 steps:
0. Getting ready (interphase) / Growing (G1)
1. the DNA is damaged [p53 broken]: Getting ready (interphase) / Damaged, and p53 is broken
2. copies it anyway: Getting ready (interphase) / Copying damaged DNA
3. the damage is copied as a mutation: Getting ready (interphase) / Checking the copy (G2)
4. passes the second check: Dividing (mitosis) / Coiling up (prophase)
5. the nucleus opens: Dividing (mitosis) / The spindle reaches in (prometaphase)
6. fibres catch some chromosomes: Dividing (mitosis) / Some caught, the check waits
7. every chromosome is caught: Dividing (mitosis) / Lined up in the middle (metaphase)
8. the sisters are pulled apart: Dividing (mitosis) / Sisters pulled apart (anaphase)
9. two nuclei form: Dividing (mitosis) / Two nuclei form (telophase)
10. the cell pinches: Dividing (mitosis) / Pinching in two (cytokinesis)
11. splits, passing the mutation on: Two cells carrying a mutation

## Rules that hold
TypeOK, CopiesBeforeDividing, NoDeadlock
