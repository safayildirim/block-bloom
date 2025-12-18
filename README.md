# Block Blast - Expo Puzzle Game

A high-performance puzzle game similar to "Block Blast" built with React Native, Expo, and Skia.

## 🎮 Game Features

- **8x8 Grid:** Classic block puzzle gameplay
- **20+ Block Shapes:** Variety of Tetris-style pieces
- **Line Clearing:** Clear rows and columns for points
- **Combo System:** Extra points for multiple lines
- **High Score:** Persistent best score tracking
- **Game Over Detection:** Automatic when no moves available

## 🚀 Quick Start

### 1. Install Dependencies

```bash
# Install required packages
npm install @shopify/react-native-skia

# or use the provided script
chmod +x install-game-deps.sh
./install-game-deps.sh
```

### 2. Run the App

```bash
npm start
# Then press 'i' for iOS or 'a' for Android
```

## 📁 Project Structure

```
block-blast/
├── app/                      # Expo Router screens
│   └── (tabs)/
│       └── index.tsx         # ✅ Main game screen
│
├── src/                      # Game logic & components
│   ├── types.ts              # ✅ TypeScript definitions
│   ├── constants.ts          # ✅ Game configuration
│   ├── store/
│   │   └── useGameStore.ts   # ✅ Zustand state management
│   └── components/
│       ├── GameBoard.tsx     # ✅ Skia canvas renderer
│       └── DraggableBlock.tsx # ⏳ To implement
│
└── components/               # Expo shared components
```

## 📊 Implementation Status

### ✅ Completed (Steps 2-4)

- [x] **Step 2:** Data structures (types, constants, shapes)
- [x] **Step 3:** State management (Zustand store with game logic)
- [x] **Step 4:** Game board rendering (Skia canvas)
- [x] **Bonus:** Main game screen with UI layout

### ⏳ To Implement (Steps 5-6)

- [ ] **Step 5:** Draggable block component with gestures
- [ ] **Step 6:** Integration and polish

## 🛠 Tech Stack

| Technology | Purpose |
|------------|---------|
| **React Native** | Cross-platform mobile framework |
| **Expo SDK 50+** | Development tooling |
| **TypeScript** | Type safety |
| **Zustand** | State management |
| **@shopify/react-native-skia** | High-performance canvas rendering |
| **react-native-reanimated** | Smooth animations (60fps) |
| **react-native-gesture-handler** | Touch gestures |
| **expo-haptics** | Tactile feedback |

## 📖 Documentation

- **[GAME_SETUP.md](./GAME_SETUP.md)** - Step-by-step implementation guide
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - Technical architecture details
- **[IMPLEMENTATION_STATUS.md](./IMPLEMENTATION_STATUS.md)** - Current progress

## 🎯 Core Mechanics

### Game Board
- 8x8 grid rendered with Skia for maximum performance
- Each cell: 40x40px with 2px gaps
- Hardware-accelerated rendering at 60fps

### Block System
- 3 blocks available at a time
- 20 unique shapes (lines, squares, L-shapes, T-shapes, Z-shapes, plus)
- 8 vibrant colors
- Drag and drop mechanics (to be implemented)

### Scoring
- **Base:** 10 points per cell placed
- **Line Clear:** 100 points per line
- **Combo Bonus:** 50% extra for each additional line

### Game Over
- Triggers when no current block can be placed
- Shows final score and best score
- One-tap restart

## 🧪 Testing the Current Build

The app currently displays:
1. ✅ Score header
2. ✅ Game board with empty 8x8 grid
3. ✅ Block tray with 3 colored placeholders
4. ✅ Game over modal (when triggered)

Try it:
```bash
npm start
```

## 🔧 Development

### Available Scripts

```bash
npm start          # Start Expo dev server
npm run ios        # Run on iOS simulator
npm run android    # Run on Android emulator
npm run lint       # Run ESLint
```

### State Management

Access game state anywhere:

```typescript
import { useGameStore } from '@/src/store/useGameStore';

function MyComponent() {
  const { grid, score, placeBlock } = useGameStore();
  
  // Check if block can be placed
  const canPlace = useGameStore(s => s.checkCollision(shape, row, col));
  
  // Place a block
  placeBlock('block-id', row, col);
}
```

## 🎨 Design System

**Colors:**
- Background: `#0a0a15`
- Grid: `#1a1a2e`
- Empty cells: `#0f3460`
- Filled cells: `#e94560`
- Tray: `#16162a`

**Typography:**
- Score labels: 12px, uppercase, letter-spacing
- Score values: 28px, bold
- Game over: 32px, bold

## 🚦 Next Steps

1. **Implement DraggableBlock component:**
   - Use `Gesture.Pan()` from react-native-gesture-handler
   - Real-time collision detection
   - Ghost preview on the board
   - Spring animation on invalid drop
   - Haptic feedback on placement

2. **Integration:**
   - Replace placeholders in `app/(tabs)/index.tsx`
   - Add block drag and drop
   - Test on physical device
   - Performance optimization

3. **Polish (Optional):**
   - Line clear animations
   - Sound effects
   - Particle effects
   - Multiple themes

## 📱 Performance Targets

- **Rendering:** 60fps on iPhone 12+
- **Touch Response:** <16ms input lag
- **Collision Check:** <1ms per block
- **Memory:** <50MB footprint

## 🤝 Contributing

This is a learning project. Feel free to:
- Add new block shapes to `src/constants.ts`
- Improve scoring algorithm in `src/store/useGameStore.ts`
- Enhance UI/UX in `app/(tabs)/index.tsx`

## 📄 License

MIT

---

**Status:** Foundation Complete (3/6 steps)  
**Last Updated:** December 19, 2025

Ready to implement drag-and-drop mechanics! 🎮
