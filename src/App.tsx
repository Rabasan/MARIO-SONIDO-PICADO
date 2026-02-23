import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, RotateCcw, Trophy, Music, Settings, AlertCircle, ChevronRight, Mic, MicOff } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AudioProcessor } from './services/audioProcessor';
import { LEVELS, LevelConfig, GameState } from './constants';

// --- Game Constants ---
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 400;
const GRAVITY = 0.6;
const JUMP_FORCE = -12;
const GROUND_Y = CANVAS_HEIGHT - 60;
const PLAYER_SIZE = 40;
const OBSTACLE_WIDTH = 30;
const OBSTACLE_HEIGHT = 50;

export default function App() {
  const [gameState, setGameState] = useState<GameState>({
    status: 'menu',
    currentLevel: null,
    score: 0,
    soundsDetected: 0,
    timeLeft: 120,
  });

  const [micEnabled, setMicEnabled] = useState(false);
  const [threshold, setThreshold] = useState(30);
  const [proSpeed, setProSpeed] = useState(1.5);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioProcessorRef = useRef<AudioProcessor | null>(null);
  const requestRef = useRef<number>(null);
  
  // Game Objects
  const playerRef = useRef({
    y: GROUND_Y - PLAYER_SIZE,
    vy: 0,
    isJumping: false,
    hoverTime: 0,
  });
  const obstaclesRef = useRef<{ x: number; type: 'pipe' | 'box' | 'plant' }[]>([]);
  const lastObstacleTime = useRef(0);
  const gameTimeRef = useRef(0);
  const soundsCountRef = useRef(0);

  // Initialize Audio
  const toggleMic = async () => {
    if (!micEnabled) {
      try {
        if (!audioProcessorRef.current) {
          audioProcessorRef.current = new AudioProcessor();
        }
        await audioProcessorRef.current.start();
        setMicEnabled(true);
      } catch (err) {
        alert("No se pudo acceder al micrófono. Por favor, permite el acceso.");
      }
    } else {
      audioProcessorRef.current?.stop();
      setMicEnabled(false);
    }
  };

  useEffect(() => {
    if (audioProcessorRef.current) {
      audioProcessorRef.current.setThreshold(threshold);
    }
  }, [threshold]);

  const startGame = (level: LevelConfig) => {
    if (!micEnabled) {
      alert("Por favor, activa el micrófono antes de empezar.");
      return;
    }
    
    setGameState({
      status: 'playing',
      currentLevel: level,
      score: 0,
      soundsDetected: 0,
      timeLeft: level.duration,
    });

    // Reset game objects
    playerRef.current = {
      y: GROUND_Y - PLAYER_SIZE,
      vy: 0,
      isJumping: false,
    };
    obstaclesRef.current = [];
    lastObstacleTime.current = 0;
    gameTimeRef.current = 0;
    soundsCountRef.current = 0;
  };

  const gameLoop = useCallback((time: number) => {
    if (gameState.status !== 'playing' || !canvasRef.current || !gameState.currentLevel) return;

    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    const level = gameState.currentLevel;
    const dt = 16.67; // approx 60fps
    gameTimeRef.current += dt / 1000;

    // Update time left
    const newTimeLeft = Math.max(0, level.duration - gameTimeRef.current);
    if (newTimeLeft === 0) {
      setGameState(prev => ({ ...prev, status: soundsCountRef.current >= level.requiredSounds ? 'win' : 'gameover' }));
      return;
    }

    // Audio Detection
    let isSounding = false;
    let volume = 0;
    if (audioProcessorRef.current) {
      const audioStatus = audioProcessorRef.current.checkSound();
      isSounding = audioStatus.isSounding;
      volume = audioProcessorRef.current.getVolume();
      
      // Discrete Jump on Onset (Note start)
      if (audioStatus.onset) {
        playerRef.current.vy = JUMP_FORCE; // Immediate jump force
        playerRef.current.isJumping = true;
        playerRef.current.hoverTime = 0;
        soundsCountRef.current += 1;
        setGameState(prev => ({ ...prev, soundsDetected: soundsCountRef.current }));
      }
    }

    // Physics: Jump + Hover
    if (isSounding && playerRef.current.isJumping) {
      // If sound continues, provide some lift (hover) for up to 2 seconds
      if (playerRef.current.hoverTime < 2) {
        // Counter gravity slightly to stay in air longer
        playerRef.current.vy = Math.min(playerRef.current.vy, 1.0); 
        playerRef.current.hoverTime += dt / 1000;
      } else {
        playerRef.current.vy += GRAVITY;
      }
    } else {
      playerRef.current.vy += GRAVITY;
    }
    
    playerRef.current.y += playerRef.current.vy;

    // Boundary checks
    if (playerRef.current.y > GROUND_Y - PLAYER_SIZE) {
      playerRef.current.y = GROUND_Y - PLAYER_SIZE;
      playerRef.current.vy = 0;
      playerRef.current.isJumping = false;
    }
    
    if (playerRef.current.y < 0) {
      playerRef.current.y = 0;
      playerRef.current.vy = 0;
    }

    // Obstacle Generation
    const beatInterval = 60000 / level.bpm;
    const currentSpeed = level.isPro ? proSpeed : level.speedMultiplier;
    const scrollSpeed = currentSpeed * 4;

    if (time - lastObstacleTime.current > beatInterval) {
      if (Math.random() > 0.4) {
        const types: ('pipe' | 'box' | 'plant')[] = ['pipe', 'box', 'plant'];
        const type = types[Math.floor(Math.random() * types.length)];
        obstaclesRef.current.push({ x: CANVAS_WIDTH, type });
      }
      lastObstacleTime.current = time;
    }

    // Update Obstacles
    obstaclesRef.current = obstaclesRef.current.map(obs => ({ ...obs, x: obs.x - scrollSpeed }));
    
    // Collision Detection
    for (const obs of obstaclesRef.current) {
      const obsHeight = obs.type === 'box' ? 40 : OBSTACLE_HEIGHT;
      const obsY = obs.type === 'box' ? GROUND_Y - 100 : GROUND_Y - obsHeight; // Boxes are higher
      
      if (
        obs.x < 50 + PLAYER_SIZE &&
        obs.x + OBSTACLE_WIDTH > 50 &&
        playerRef.current.y + PLAYER_SIZE > obsY &&
        playerRef.current.y < obsY + obsHeight
      ) {
        setGameState(prev => ({ ...prev, status: 'gameover' }));
        return;
      }
    }

    // Remove off-screen obstacles
    obstaclesRef.current = obstaclesRef.current.filter(obs => obs.x > -OBSTACLE_WIDTH);

    // Drawing
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Background (Sky)
    ctx.fillStyle = '#5c94fc';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Clouds (Simple)
    ctx.fillStyle = '#fff';
    [100, 300, 500, 700].forEach((cx, i) => {
      const x = (cx - (gameTimeRef.current * 20)) % (CANVAS_WIDTH + 100);
      ctx.beginPath();
      ctx.arc(x, 50 + (i % 2 * 30), 20, 0, Math.PI * 2);
      ctx.arc(x + 15, 45 + (i % 2 * 30), 25, 0, Math.PI * 2);
      ctx.arc(x + 35, 50 + (i % 2 * 30), 20, 0, Math.PI * 2);
      ctx.fill();
    });

    // Ground
    ctx.fillStyle = '#e45c10';
    ctx.fillRect(0, GROUND_Y, CANVAS_WIDTH, CANVAS_HEIGHT - GROUND_Y);
    ctx.fillStyle = '#944200';
    ctx.fillRect(0, GROUND_Y, CANVAS_WIDTH, 4);

    // Player (Mario-like)
    ctx.save();
    ctx.translate(50, playerRef.current.y);
    // Body
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(0, 0, PLAYER_SIZE, PLAYER_SIZE);
    // Overalls
    ctx.fillStyle = '#0000ff';
    ctx.fillRect(0, PLAYER_SIZE * 0.6, PLAYER_SIZE, PLAYER_SIZE * 0.4);
    ctx.fillRect(PLAYER_SIZE * 0.2, PLAYER_SIZE * 0.4, PLAYER_SIZE * 0.2, PLAYER_SIZE * 0.2);
    ctx.fillRect(PLAYER_SIZE * 0.6, PLAYER_SIZE * 0.4, PLAYER_SIZE * 0.2, PLAYER_SIZE * 0.2);
    // Face
    ctx.fillStyle = '#ffcca3';
    ctx.fillRect(PLAYER_SIZE * 0.5, PLAYER_SIZE * 0.1, PLAYER_SIZE * 0.5, PLAYER_SIZE * 0.4);
    // Hat
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(PLAYER_SIZE * 0.4, 0, PLAYER_SIZE * 0.6, PLAYER_SIZE * 0.15);
    // Eye
    ctx.fillStyle = '#000';
    ctx.fillRect(PLAYER_SIZE * 0.8, PLAYER_SIZE * 0.2, 4, 6);
    // Hover Effect (Glow)
    if (isSounding && playerRef.current.isJumping) {
      ctx.shadowBlur = 15;
      ctx.shadowColor = '#ffff00';
      ctx.strokeStyle = '#ffff00';
      ctx.lineWidth = 2;
      ctx.strokeRect(-2, -2, PLAYER_SIZE + 4, PLAYER_SIZE + 4);
    }
    ctx.restore();

    // Obstacles
    obstaclesRef.current.forEach(obs => {
      if (obs.type === 'pipe' || obs.type === 'plant') {
        // Pipe Body
        ctx.fillStyle = '#74bf2e';
        ctx.fillRect(obs.x, GROUND_Y - OBSTACLE_HEIGHT, OBSTACLE_WIDTH, OBSTACLE_HEIGHT);
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.strokeRect(obs.x, GROUND_Y - OBSTACLE_HEIGHT, OBSTACLE_WIDTH, OBSTACLE_HEIGHT);
        // Pipe Top
        ctx.fillStyle = '#74bf2e';
        ctx.fillRect(obs.x - 5, GROUND_Y - OBSTACLE_HEIGHT, OBSTACLE_WIDTH + 10, 15);
        ctx.strokeRect(obs.x - 5, GROUND_Y - OBSTACLE_HEIGHT, OBSTACLE_WIDTH + 10, 15);
        // Shading
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.fillRect(obs.x + OBSTACLE_WIDTH - 8, GROUND_Y - OBSTACLE_HEIGHT, 5, OBSTACLE_HEIGHT);
        
        if (obs.type === 'plant') {
          // Piranha Plant
          const plantY = GROUND_Y - OBSTACLE_HEIGHT - 10 - Math.sin(gameTimeRef.current * 5) * 10;
          ctx.fillStyle = '#ff0000';
          ctx.beginPath();
          ctx.arc(obs.x + OBSTACLE_WIDTH/2, plantY, 12, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          // Dots
          ctx.fillStyle = '#fff';
          ctx.beginPath(); ctx.arc(obs.x + OBSTACLE_WIDTH/2 - 4, plantY - 4, 3, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(obs.x + OBSTACLE_WIDTH/2 + 4, plantY + 2, 2, 0, Math.PI * 2); ctx.fill();
        }
      } else if (obs.type === 'box') {
        // Question Block
        const boxY = GROUND_Y - 100;
        ctx.fillStyle = '#f8b800';
        ctx.fillRect(obs.x, boxY, 40, 40);
        ctx.strokeStyle = '#000';
        ctx.strokeRect(obs.x, boxY, 40, 40);
        // Question Mark
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 24px Arial';
        ctx.fillText('?', obs.x + 12, boxY + 28);
        // Screws
        ctx.fillStyle = '#000';
        ctx.fillRect(obs.x + 4, boxY + 4, 2, 2);
        ctx.fillRect(obs.x + 34, boxY + 4, 2, 2);
        ctx.fillRect(obs.x + 4, boxY + 34, 2, 2);
        ctx.fillRect(obs.x + 34, boxY + 34, 2, 2);
      }
    });

    requestRef.current = requestAnimationFrame(gameLoop);
  }, [gameState.status, gameState.currentLevel, proSpeed]);

  useEffect(() => {
    if (gameState.status === 'playing') {
      requestRef.current = requestAnimationFrame(gameLoop);
    } else {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    }
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [gameState.status, gameLoop]);

  // --- Renderers ---

  const renderMenu = () => (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#5c94fc] p-6 font-sans text-white">
      <motion.div 
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="text-center mb-12"
      >
        <h1 className="text-6xl font-black tracking-tighter uppercase mb-2 drop-shadow-lg">
          Mario Sound Jump
        </h1>
        <p className="text-xl opacity-90 italic">¡Salta con el sonido de tu instrumento!</p>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl w-full">
        {LEVELS.map((level) => (
          <motion.button
            key={level.id}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => startGame(level)}
            className="bg-white/10 backdrop-blur-md border-2 border-white/20 p-6 rounded-3xl text-left hover:bg-white/20 transition-all group relative overflow-hidden"
          >
            <div className="flex justify-between items-start mb-4">
              <span className="text-xs font-bold uppercase tracking-widest bg-yellow-400 text-black px-3 py-1 rounded-full">
                Nivel {level.id}
              </span>
              <Music className="opacity-50 group-hover:opacity-100 transition-opacity" />
            </div>
            <h3 className="text-2xl font-bold mb-2">{level.name}</h3>
            <p className="text-sm opacity-80 mb-4">{level.description}</p>
            <div className="flex gap-4 text-xs font-mono">
              <span className="bg-black/20 px-2 py-1 rounded">{level.bpm} BPM</span>
              <span className="bg-black/20 px-2 py-1 rounded">{level.requiredSounds} Sonidos</span>
              <span className="bg-black/20 px-2 py-1 rounded">2 Minutos</span>
            </div>
            <ChevronRight className="absolute bottom-6 right-6 opacity-0 group-hover:opacity-100 transform translate-x-4 group-hover:translate-x-0 transition-all" />
          </motion.button>
        ))}
      </div>

      <div className="mt-12 flex flex-col items-center gap-6 bg-black/30 p-8 rounded-3xl border border-white/10 w-full max-w-md">
        <div className="flex items-center gap-4 w-full">
          <button 
            onClick={toggleMic}
            className={`p-4 rounded-full transition-colors ${micEnabled ? 'bg-green-500' : 'bg-red-500'}`}
          >
            {micEnabled ? <Mic size={24} /> : <MicOff size={24} />}
          </button>
          <div className="flex-1">
            <label className="text-xs font-bold uppercase mb-1 block">Sensibilidad del Micro</label>
            <input 
              type="range" 
              min="5" 
              max="100" 
              value={threshold} 
              onChange={(e) => setThreshold(parseInt(e.target.value))}
              className="w-full h-2 bg-white/20 rounded-lg appearance-none cursor-pointer accent-yellow-400"
            />
          </div>
        </div>
        <p className="text-xs opacity-60 text-center">
          Asegúrate de que el micrófono esté activo y ajusta la sensibilidad para que el personaje salte solo cuando toques.
        </p>
      </div>
    </div>
  );

  const renderPlaying = () => (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-900 p-4 font-mono">
      <div className="w-full max-w-[800px] flex justify-between items-end mb-4 text-white">
        <div>
          <h2 className="text-xl font-bold text-yellow-400">{gameState.currentLevel?.name}</h2>
          <div className="flex gap-4 mt-1">
            <span className="text-sm">BPM: {gameState.currentLevel?.bpm}</span>
            {gameState.currentLevel?.isPro && (
              <div className="flex items-center gap-2">
                <span className="text-sm">Velocidad:</span>
                <input 
                  type="range" 
                  min="1" 
                  max="5" 
                  step="0.1"
                  value={proSpeed}
                  onChange={(e) => setProSpeed(parseFloat(e.target.value))}
                  className="w-24 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-yellow-400"
                />
              </div>
            )}
          </div>
        </div>
        <div className="text-right">
          <div className="text-3xl font-black">
            {Math.floor(gameState.timeLeft / 60)}:{(gameState.timeLeft % 60).toString().padStart(2, '0')}
          </div>
          <div className="text-sm text-green-400">
            Sonidos: {gameState.soundsDetected} / {gameState.currentLevel?.requiredSounds}
          </div>
        </div>
      </div>

      <div className="relative rounded-2xl overflow-hidden border-4 border-white/10 shadow-2xl">
        <canvas 
          ref={canvasRef} 
          width={CANVAS_WIDTH} 
          height={CANVAS_HEIGHT}
          className="bg-black"
        />
        
        {/* Audio Visualizer Overlay (Small) */}
        <div className="absolute top-4 left-4 bg-black/50 p-2 rounded-lg border border-white/10 flex items-center gap-2">
          <div className="w-2 h-8 bg-white/20 rounded-full overflow-hidden flex flex-col justify-end">
            <motion.div 
              animate={{ height: `${Math.min(100, (audioProcessorRef.current?.getVolume() || 0) * 2)}%` }}
              className="w-full bg-green-500"
            />
          </div>
          <div className="text-[10px] text-white/70 uppercase">Mic Level</div>
        </div>
      </div>

      <button 
        onClick={() => setGameState(prev => ({ ...prev, status: 'menu' }))}
        className="mt-8 text-white/50 hover:text-white flex items-center gap-2 transition-colors"
      >
        <RotateCcw size={16} /> Salir al Menú
      </button>
    </div>
  );

  const renderGameOver = () => (
    <div className="flex flex-col items-center justify-center min-h-screen bg-red-900 p-6 text-white font-sans">
      <motion.div 
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="text-center"
      >
        <AlertCircle size={80} className="mx-auto mb-6 text-red-400" />
        <h2 className="text-6xl font-black mb-2 uppercase italic">¡Game Over!</h2>
        <p className="text-xl opacity-80 mb-8">Te has chocado con un obstáculo o se acabó el tiempo.</p>
        
        <div className="bg-black/20 p-6 rounded-3xl mb-8 border border-white/10">
          <div className="text-sm uppercase tracking-widest opacity-60 mb-1">Progreso</div>
          <div className="text-3xl font-bold">
            {gameState.soundsDetected} / {gameState.currentLevel?.requiredSounds} Sonidos
          </div>
        </div>

        <div className="flex gap-4 justify-center">
          <button 
            onClick={() => gameState.currentLevel && startGame(gameState.currentLevel)}
            className="bg-white text-red-900 px-8 py-4 rounded-full font-bold flex items-center gap-2 hover:bg-red-100 transition-colors"
          >
            <RotateCcw size={20} /> Reintentar
          </button>
          <button 
            onClick={() => setGameState(prev => ({ ...prev, status: 'menu' }))}
            className="bg-red-800 text-white px-8 py-4 rounded-full font-bold flex items-center gap-2 hover:bg-red-700 transition-colors border border-white/20"
          >
            Menú Principal
          </button>
        </div>
      </motion.div>
    </div>
  );

  const renderWin = () => (
    <div className="flex flex-col items-center justify-center min-h-screen bg-green-600 p-6 text-white font-sans">
      <motion.div 
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="text-center"
      >
        <Trophy size={80} className="mx-auto mb-6 text-yellow-400" />
        <h2 className="text-6xl font-black mb-2 uppercase italic">¡Victoria!</h2>
        <p className="text-xl opacity-80 mb-8">Has completado el nivel con éxito.</p>
        
        <div className="bg-black/20 p-6 rounded-3xl mb-8 border border-white/10">
          <div className="text-sm uppercase tracking-widest opacity-60 mb-1">Resultado Final</div>
          <div className="text-3xl font-bold">
            {gameState.soundsDetected} Sonidos Realizados
          </div>
        </div>

        <div className="flex gap-4 justify-center">
          <button 
            onClick={() => setGameState(prev => ({ ...prev, status: 'menu' }))}
            className="bg-white text-green-900 px-8 py-4 rounded-full font-bold flex items-center gap-2 hover:bg-green-100 transition-colors"
          >
            Siguiente Nivel
          </button>
        </div>
      </motion.div>
    </div>
  );

  return (
    <main className="min-h-screen bg-slate-950">
      <AnimatePresence mode="wait">
        {gameState.status === 'menu' && renderMenu()}
        {gameState.status === 'playing' && renderPlaying()}
        {gameState.status === 'gameover' && renderGameOver()}
        {gameState.status === 'win' && renderWin()}
      </AnimatePresence>
    </main>
  );
}
