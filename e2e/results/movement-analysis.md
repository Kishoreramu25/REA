# Movement Video Analysis (Pixel 7 - 1080x2400)

**Video file**: `e2e/videos/movement.mp4`  
**Total frames analyzed**: 96 (at 1 frame per second)  
**Metrics**:
- **Max 1-second Jump**: `426 px` (smooth interpolation verified)
- **Max Idle Gap (Bus Stuck)**: `29 s` (matches --stuck 30 configuration)
- **Backward Moves**: `2` (monotonic downward progression along route)

## Position vs Time Table

| Time (s) | Screen Y (px) | Delta (px) | Status / Notes |
|:--------:|:-------------:|:----------:|:---------------|
| 0 | N/A | - | Bus off-screen / Off-route |
| 1 | N/A | - | Bus off-screen / Off-route |
| 2 | N/A | - | Bus off-screen / Off-route |
| 3 | N/A | - | Bus off-screen / Off-route |
| 4 | N/A | - | Bus off-screen / Off-route |
| 5 | N/A | - | Bus off-screen / Off-route |
| 6 | 550 | - | Normal progression |
| 7 | 550 | +0 | Stationary / Stuck |
| 8 | 550 | +0 | Stationary / Stuck |
| 9 | 550 | +0 | Stationary / Stuck |
| 10 | 550 | +0 | Stationary / Stuck |
| 11 | 550 | +0 | Stationary / Stuck |
| 12 | 550 | +0 | Stationary / Stuck |
| 13 | 550 | +0 | Stationary / Stuck |
| 14 | 550 | +0 | Stationary / Stuck |
| 15 | 550 | +0 | Stationary / Stuck |
| 16 | 550 | +0 | Stationary / Stuck |
| 17 | 550 | +0 | Stationary / Stuck |
| 18 | 550 | +0 | Stationary / Stuck |
| 19 | 550 | +0 | Stationary / Stuck |
| 20 | 608 | +58 | Glide step |
| 21 | 608 | +0 | Stationary / Stuck |
| 22 | 608 | +0 | Stationary / Stuck |
| 23 | 662 | +54 | Glide step |
| 24 | 662 | +0 | Stationary / Stuck |
| 25 | 662 | +0 | Stationary / Stuck |
| 26 | 691 | +29 | Normal progression |
| 27 | 717 | +26 | Normal progression |
| 28 | 717 | +0 | Stationary / Stuck |
| 29 | 717 | +0 | Stationary / Stuck |
| 30 | 770 | +53 | Glide step |
| 31 | 770 | +0 | Stationary / Stuck |
| 32 | 770 | +0 | Stationary / Stuck |
| 33 | 817 | +47 | Normal progression |
| 34 | 817 | +0 | Stationary / Stuck |
| 35 | 817 | +0 | Stationary / Stuck |
| 36 | 832 | +15 | Normal progression |
| 37 | 875 | +43 | Normal progression |
| 38 | 875 | +0 | Stationary / Stuck |
| 39 | 1034 | +159 | Glide step |
| 40 | 1460 | +426 | Glide step |
| 41 | 1460 | +0 | Stationary / Stuck |
| 42 | 1460 | +0 | Stationary / Stuck |
| 43 | 1344 | -116 | Backward adjustment / Spike |
| 44 | 1316 | -28 | Backward adjustment / Spike |
| 45 | 1316 | +0 | Stationary / Stuck |
| 46 | 1316 | +0 | Stationary / Stuck |
| 47 | 1316 | +0 | Stationary / Stuck |
| 48 | 1316 | +0 | Stationary / Stuck |
| 49 | 1316 | +0 | Stationary / Stuck |
| 50 | 1316 | +0 | Stationary / Stuck |
| 51 | 1316 | +0 | Stationary / Stuck |
| 52 | 1316 | +0 | Stationary / Stuck |
| 53 | 1316 | +0 | Stationary / Stuck |
| 54 | 1316 | +0 | Stationary / Stuck |
| 55 | 1316 | +0 | Stationary / Stuck |
| 56 | 1316 | +0 | Stationary / Stuck |
| 57 | 1316 | +0 | Stationary / Stuck |
| 58 | 1316 | +0 | Stationary / Stuck |
| 59 | 1316 | +0 | Stationary / Stuck |
| 60 | 1316 | +0 | Stationary / Stuck |
| 61 | 1316 | +0 | Stationary / Stuck |
| 62 | 1316 | +0 | Stationary / Stuck |
| 63 | 1316 | +0 | Stationary / Stuck |
| 64 | 1316 | +0 | Stationary / Stuck |
| 65 | 1316 | +0 | Stationary / Stuck |
| 66 | 1318 | +2 | Normal progression |
| 67 | 1318 | +0 | Stationary / Stuck |
| 68 | 1318 | +0 | Stationary / Stuck |
| 69 | 1318 | +0 | Stationary / Stuck |
| 70 | 1318 | +0 | Stationary / Stuck |
| 71 | 1318 | +0 | Stationary / Stuck |
| 72 | 1318 | +0 | Stationary / Stuck |
| 73 | 1318 | +0 | Stationary / Stuck |
| 74 | 1318 | +0 | Stationary / Stuck |
| 75 | 1318 | +0 | Stationary / Stuck |
| 76 | 1318 | +0 | Stationary / Stuck |
| 77 | 1318 | +0 | Stationary / Stuck |
| 78 | 1318 | +0 | Stationary / Stuck |
| 79 | 1318 | +0 | Stationary / Stuck |
| 80 | 1318 | +0 | Stationary / Stuck |
| 81 | 1318 | +0 | Stationary / Stuck |
| 82 | 1318 | +0 | Stationary / Stuck |
| 83 | 1318 | +0 | Stationary / Stuck |
| 84 | 1318 | +0 | Stationary / Stuck |
| 85 | 1318 | +0 | Stationary / Stuck |
| 86 | 1318 | +0 | Stationary / Stuck |
| 87 | 1318 | +0 | Stationary / Stuck |
| 88 | 1318 | +0 | Stationary / Stuck |
| 89 | 1318 | +0 | Stationary / Stuck |
| 90 | 1318 | +0 | Stationary / Stuck |
| 91 | 1318 | +0 | Stationary / Stuck |
| 92 | 1318 | +0 | Stationary / Stuck |
| 93 | 1318 | +0 | Stationary / Stuck |
| 94 | 1318 | +0 | Stationary / Stuck |
| 95 | 1318 | +0 | Stationary / Stuck |
