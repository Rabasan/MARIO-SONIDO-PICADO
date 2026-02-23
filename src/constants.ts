export interface LevelConfig {
  id: number;
  name: string;
  bpm: number;
  duration: number; // in seconds
  requiredSounds: number;
  description: string;
  speedMultiplier: number;
  isPro?: boolean;
}

export const LEVELS: LevelConfig[] = [
  {
    id: 1,
    name: "Nivel 1: Principiante",
    bpm: 50,
    duration: 120,
    requiredSounds: 10,
    description: "Pantalla lenta. Realiza 10 sonidos para ganar.",
    speedMultiplier: 1,
  },
  {
    id: 2,
    name: "Nivel 2: Intermedio",
    bpm: 60,
    duration: 120,
    requiredSounds: 10,
    description: "Velocidad moderada. Realiza 10 sonidos para ganar.",
    speedMultiplier: 1.2,
  },
  {
    id: 3,
    name: "Nivel 3: Avanzado",
    bpm: 70,
    duration: 120,
    requiredSounds: 20,
    description: "Velocidad rápida. Realiza 20 sonidos para ganar.",
    speedMultiplier: 1.5,
  },
  {
    id: 4,
    name: "Nivel 4: Pro",
    bpm: 70,
    duration: 120,
    requiredSounds: 20,
    description: "Dificultad escalable. La velocidad aumenta con el tiempo.",
    speedMultiplier: 1.5,
    isPro: true,
  },
];

export interface GameState {
  status: 'menu' | 'playing' | 'gameover' | 'win';
  currentLevel: LevelConfig | null;
  score: number;
  soundsDetected: number;
  timeLeft: number;
}
