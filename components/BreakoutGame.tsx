'use client';

import React, { useState, useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';

interface RankingEntry {
  name: string;
  time: string;
}

const BRICK_ROWS = 5;
const BRICK_COLS = 8;
const PADDLE_WIDTH = 100;
const PADDLE_HEIGHT = 10;
const BALL_RADIUS = 6;
const LIVES_START = 3;

interface Brick {
  x: number;
  y: number;
  status: number;
  color: string;
  isRed: boolean;
  w?: number;
  h?: number;
}

const CREATOR_INFO = '20260190 세무회계학과 오예림';

export default function BreakoutGame() {
  // Screens: 'START', 'GAME', 'SUCCESS', 'OVER'
  const [screen, setScreen] = useState('START');
  const [userName, setUserName] = useState('');
  const [ranking, setRanking] = useState<RankingEntry[]>([]);
  const [score, setScore] = useState(0); // number of red bricks hit
  const [lives, setLives] = useState(LIVES_START);
  const [timer, setTimer] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [countdown, setCountdown] = useState(0);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameState = useRef({
    ballX: 0,
    ballY: 0,
    ballDX: 4,
    ballDY: -4,
    paddleX: 0,
    bricks: [] as any[],
    lastTime: 0,
    timerInterval: null as any,
    requestRef: null as any,
    redBricksCleared: 0,
    gameStarted: false,
    // Add states used in loop to refs to avoid stale closures
    currentScreen: 'START',
    isPaused: false,
    countdown: 0,
    lives: LIVES_START,
    timer: 0,
    leftPressed: false,
    rightPressed: false,
    startTime: 0,
  });

  const audioCtx = useRef<AudioContext | null>(null);

  const bgmRef = useRef<HTMLAudioElement | null>(null);
  const hitSfxRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // Initial fetch of ranking
    fetchRanking();
  }, []);

  const fetchRanking = async () => {
    try {
      const res = await fetch('/api/ranking');
      const data = await res.json();
      if (data && Array.isArray(data)) {
        setRanking(data.slice(0, 3));
      }
    } catch (e) {
      console.error('Failed to load ranking');
    }
  };

  const saveScore = async (name: string, timeStr: string) => {
    try {
      await fetch('/api/ranking', {
        method: 'POST',
        body: JSON.stringify({ name, time: timeStr }),
      });
      fetchRanking();
    } catch (e) {
      console.error('Failed to save score');
    }
  };

  const handleStart = () => {
    if (!userName.trim()) return alert('이름을 입력해주세요!');
    gameState.current.currentScreen = 'GAME'; 
    setScreen('GAME');
  };

  const initGame = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    gameState.current.paddleX = (canvas.width - PADDLE_WIDTH) / 2;
    gameState.current.ballX = canvas.width / 2;
    gameState.current.ballY = canvas.height - 30;
    gameState.current.ballDX = 4;
    gameState.current.ballDY = -4;
    gameState.current.redBricksCleared = 0;
    gameState.current.lives = LIVES_START;
    gameState.current.timer = 0;
    setScore(0);
    setLives(LIVES_START);
    setTimer(0);
    
    // Init bricks
    const bricks: Brick[][] = [];
    const colors = ['#FDA4AF', '#FED7AA', '#FEF08A', '#BFDBFE', '#BBF7D0', '#E9D5FF']; // Light Red, Orange, Yellow, Blue, Green, Purple
    
    for (let r = 0; r < BRICK_ROWS; r++) {
      bricks[r] = [];
      for (let c = 0; c < BRICK_COLS; c++) {
        const isRed = Math.random() < 0.3;
        const color = isRed ? colors[0] : colors[Math.floor(Math.random() * 5) + 1];
        bricks[r][c] = { x: 0, y: 0, status: 1, color, isRed };
      }
    }
    gameState.current.bricks = bricks;
  };

  const startCountdown = () => {
    setCountdown(3);
    gameState.current.countdown = 3;

    // Play BGM during countdown
    if (bgmRef.current) {
        bgmRef.current.volume = 0.1;
        bgmRef.current.play().catch(() => {});
    }

    const interval = setInterval(() => {
      setCountdown(prev => {
        const next = prev - 1;
        if (next <= 0) {
          clearInterval(interval);
          gameState.current.countdown = 0; // Add this line!
          startGameLoop();
          return 0;
        }
        gameState.current.countdown = next;
        return next;
      });
    }, 1000);
  };

  const startGameLoop = () => {
    gameState.current.gameStarted = true;
    gameState.current.lastTime = performance.now();
    gameState.current.startTime = performance.now();
  };

  const formatTime = (seconds: number) => {
    const totalSeconds = Math.floor(seconds);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const update = (time: number) => {
    const canvas = canvasRef.current;
    
    // Safety check: if canvas is missing, just keep trying
    if (!canvas) {
        gameState.current.requestRef = requestAnimationFrame(update);
        return;
    }

    // Ensure we are in the right screen
    if (gameState.current.currentScreen !== 'GAME') {
        gameState.current.requestRef = requestAnimationFrame(update);
        return;
    }

    // Lazy initialization: if bricks are not ready, try to init now
    if (!gameState.current.bricks || gameState.current.bricks.length === 0) {
        initGame();
        // If still not ready (canvas found but init failed?), retry next frame
        if (!gameState.current.bricks || gameState.current.bricks.length === 0) {
            gameState.current.requestRef = requestAnimationFrame(update);
            return;
        }
        // If we just initialized, start the countdown too
        startCountdown();
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas - White base
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Drawing
    drawBricks(ctx);
    drawBall(ctx);
    drawPaddle(ctx);

    // Movement & Collision
    if (gameState.current.isPaused || gameState.current.countdown > 0) {
        // Just update lastTime when paused so it doesn't jump
        gameState.current.lastTime = performance.now();
        gameState.current.requestRef = requestAnimationFrame(update);
        return;
    }

    // Time Tracking
    const now = performance.now();
    const dt = (now - gameState.current.lastTime) / 1000;
    gameState.current.lastTime = now;
    
    if (gameState.current.gameStarted) {
        const prevTimer = Math.floor(gameState.current.timer);
        gameState.current.timer += dt;
        const currentTimer = Math.floor(gameState.current.timer);
        
        // Only update React state when a full second passes to optimize rendering
        if (currentTimer !== prevTimer) {
            setTimer(currentTimer);
        }
    }

    collisionDetection();

    // Movement logic
    let { ballX, ballY, ballDX, ballDY, paddleX } = gameState.current;

    if (ballX + ballDX > canvas.width - BALL_RADIUS || ballX + ballDX < BALL_RADIUS) {
      gameState.current.ballDX = -ballDX;
    }
    if (ballY + ballDY < BALL_RADIUS) {
      gameState.current.ballDY = -ballDY;
    } else if (ballY + ballDY > canvas.height - BALL_RADIUS) {
      if (ballX > paddleX && ballX < paddleX + PADDLE_WIDTH) {
        // Paddle bounce logic with angle
        const hitPos = (ballX - (paddleX + PADDLE_WIDTH / 2)) / (PADDLE_WIDTH / 2);
        gameState.current.ballDX = hitPos * 5;
        gameState.current.ballDY = -Math.abs(ballDY);
        playHitSound();
      } else {
        const nextLives = gameState.current.lives - 1;
        gameState.current.lives = nextLives;
        setLives(nextLives);
        if (nextLives <= 0) {
          gameOver();
          return; // Stop for real
        } else {
          resetBall();
          // Continue the loop after reset
          gameState.current.requestRef = requestAnimationFrame(update);
          return;
        }
      }
    }

    // Move paddle smoothly
    const paddleSpeed = 8;
    if (gameState.current.leftPressed) {
        gameState.current.paddleX = Math.max(0, gameState.current.paddleX - paddleSpeed);
    }
    if (gameState.current.rightPressed) {
        gameState.current.paddleX = Math.min(canvas.width - PADDLE_WIDTH, gameState.current.paddleX + paddleSpeed);
    }

    gameState.current.ballX += gameState.current.ballDX;
    gameState.current.ballY += gameState.current.ballDY;

    gameState.current.requestRef = requestAnimationFrame(update);
  };

  const resetBall = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    gameState.current.ballX = canvas.width / 2;
    gameState.current.ballY = canvas.height - 70; // Move up a bit more for safety
    gameState.current.ballDX = 4;
    gameState.current.ballDY = -4;
    gameState.current.paddleX = (canvas.width - PADDLE_WIDTH) / 2;
  };

  const drawBall = (ctx: CanvasRenderingContext2D) => {
    ctx.beginPath();
    ctx.arc(gameState.current.ballX, gameState.current.ballY, BALL_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = '#2563eb'; // Vibrant Blue
    ctx.fill();
    ctx.closePath();
  };

  const drawPaddle = (ctx: CanvasRenderingContext2D) => {
    ctx.beginPath();
    ctx.rect(gameState.current.paddleX, canvasRef.current!.height - PADDLE_HEIGHT, PADDLE_WIDTH, PADDLE_HEIGHT);
    ctx.fillStyle = '#60a5fa';
    ctx.fill();
    ctx.closePath();
  };

  const drawBricks = (ctx: CanvasRenderingContext2D) => {
    const brickPadding = 0;
    const brickOffsetTop = 40;
    const brickOffsetLeft = 0;
    const canvasWidth = canvasRef.current!.width;
    const availableWidth = canvasWidth - brickOffsetLeft * 2;
    const brickWidth = (availableWidth - (BRICK_COLS - 1) * brickPadding) / BRICK_COLS;
    const brickHeight = 20;

    for (let r = 0; r < BRICK_ROWS; r++) {
      for (let c = 0; c < BRICK_COLS; c++) {
        const b = gameState.current.bricks[r][c];
        if (b.status === 1) {
          const bx = c * (brickWidth + brickPadding) + brickOffsetLeft;
          const by = r * (brickHeight + brickPadding) + brickOffsetTop;
          b.x = bx;
          b.y = by;
          b.w = brickWidth;
          b.h = brickHeight;
          ctx.beginPath();
          ctx.rect(bx, by, brickWidth, brickHeight);
          ctx.fillStyle = b.color;
          ctx.fill();
          ctx.closePath();
        }
      }
    }
  };

  const collisionDetection = () => {
    for (let r = 0; r < BRICK_ROWS; r++) {
      for (let c = 0; c < BRICK_COLS; c++) {
        const b = gameState.current.bricks[r][c];
        if (b.status === 1) {
          if (
            gameState.current.ballX > b.x &&
            gameState.current.ballX < b.x + b.w &&
            gameState.current.ballY > b.y &&
            gameState.current.ballY < b.y + b.h
          ) {
            // ALWAYS bounce off any hit brick
            gameState.current.ballDY = -gameState.current.ballDY;

            // Check if there are any active bricks BELOW this one in the same column
            let isLowest = true;
            for (let belowR = r + 1; belowR < BRICK_ROWS; belowR++) {
              if (gameState.current.bricks[belowR][c].status === 1) {
                isLowest = false;
                break;
              }
            }

            // ONLY destroy if it's the lowest active one in the column
            if (isLowest) {
                b.status = 0;
                playHitSound();
                if (b.isRed) {
                  gameState.current.redBricksCleared += 1;
                  const newScore = gameState.current.redBricksCleared;
                  setScore(newScore);
                  if (newScore >= 3) {
                    gameWin();
                    return;
                  }
                }
            }
            // Return early after one bounce per frame to avoid multiple collisions
            return;
          }
        }
      }
    }
  };

  const playHitSound = () => {
    try {
        if (!audioCtx.current) {
            audioCtx.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        
        const ctx = audioCtx.current;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.1);
        
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.start();
        osc.stop(ctx.currentTime + 0.1);
    } catch (e) {
        console.error('Audio error:', e);
    }
  };

  const gameOver = () => {
    // Stop timer first
    if (gameState.current.timerInterval) {
        clearInterval(gameState.current.timerInterval);
        gameState.current.timerInterval = null;
    }
    cleanup();
    setScreen('OVER');
    gameState.current.currentScreen = 'OVER';
  };

  const gameWin = () => {
    // Stop timer first
    if (gameState.current.timerInterval) {
        clearInterval(gameState.current.timerInterval);
        gameState.current.timerInterval = null;
    }
    cleanup();
    setScreen('SUCCESS');
    gameState.current.currentScreen = 'SUCCESS';
    const timeStr = formatTime(gameState.current.timer);
    // Intense Fireworks logic
    const duration = 5 * 1000;
    const animationEnd = Date.now() + duration;
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };

    const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

    const interval: any = setInterval(function() {
      const timeLeft = animationEnd - Date.now();

      if (timeLeft <= 0) {
        return clearInterval(interval);
      }

      const particleCount = 50 * (timeLeft / duration);
      // since particles fall down, start a bit higher than random
      confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } });
      confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } });
    }, 250);

    saveScore(userName, timeStr);
  };

  const cleanup = () => {
    gameState.current.gameStarted = false;
    gameState.current.isPaused = false; 
    gameState.current.bricks = []; // Trigger lazy init
    gameState.current.redBricksCleared = 0;
    gameState.current.leftPressed = false;
    gameState.current.rightPressed = false;

    if (gameState.current.requestRef) {
        cancelAnimationFrame(gameState.current.requestRef);
        gameState.current.requestRef = null;
    }
    if (bgmRef.current) {
        bgmRef.current.pause();
        bgmRef.current.currentTime = 0;
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (screen !== 'GAME' || isPaused) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const root = document.documentElement;
    const mouseX = e.clientX - rect.left - root.scrollLeft;
    let newX = mouseX - PADDLE_WIDTH / 2;
    if (newX < 0) newX = 0;
    if (newX > canvas.width - PADDLE_WIDTH) newX = canvas.width - PADDLE_WIDTH;
    gameState.current.paddleX = newX;
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft') gameState.current.leftPressed = true;
    if (e.key === 'ArrowRight') gameState.current.rightPressed = true;
  };

  const handleKeyUp = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft') gameState.current.leftPressed = false;
    if (e.key === 'ArrowRight') gameState.current.rightPressed = false;
  };

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Animation Loop Effect
  useEffect(() => {
    if (screen === 'GAME') {
        // Just start the requestAnimationFrame. 
        // Initialization will happen lazily inside update() when the canvas is ready.
        gameState.current.requestRef = requestAnimationFrame(update);
    }
    return () => {
        // Essential: Clean up BOTH animation AND timer intervals on screen change
        if (gameState.current.requestRef) {
            cancelAnimationFrame(gameState.current.requestRef);
            gameState.current.requestRef = null;
        }
        if (gameState.current.timerInterval) {
            clearInterval(gameState.current.timerInterval);
            gameState.current.timerInterval = null;
        }
    };
  }, [screen]);

  // Mobile Touch Handling
  const handleTouchMove = (e: React.TouchEvent) => {
    if (screen !== 'GAME' || isPaused) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const touchX = e.touches[0].clientX - rect.left;
    let newX = touchX - PADDLE_WIDTH / 2;
    if (newX < 0) newX = 0;
    if (newX > canvas.width - PADDLE_WIDTH) newX = canvas.width - PADDLE_WIDTH;
    gameState.current.paddleX = newX;
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 text-zinc-900 relative">
      {/* Audio elements */}
      <audio ref={bgmRef} src="/Hyper_Speed_Run.mp3" loop />

      {/* Title */}
      <div className="mb-8 text-center">
        <h1 className="text-4xl md:text-6xl font-black tracking-tighter text-blue-600 drop-shadow-sm mb-2 uppercase">
          INU BREAKOUT
        </h1>
        <p className="text-zinc-500 text-xs font-bold tracking-widest uppercase opacity-60">
          AI Application Creative Development
        </p>
      </div>

      {screen === 'START' && (
        <div className="glass-panel w-full max-w-md p-8 rounded-[2rem] flex flex-col items-center animate-in fade-in zoom-in-95 duration-700 shadow-2xl shadow-blue-900/5">
          {/* Mascot Image */}
          <div className="mb-8 relative group">
            <div className="absolute -inset-4 bg-blue-500/10 rounded-full blur-xl group-hover:bg-blue-500/20 transition-all duration-500 animate-pulse-soft"></div>
            <img 
              src="/Mascot.jpg" 
              alt="INU Mascot" 
              className="w-48 h-48 object-contain relative transition-transform duration-500 group-hover:scale-110 drop-shadow-xl"
            />
          </div>

          <div className="w-full space-y-6">
            <div>
              <label className="block text-[10px] font-black text-zinc-400 mb-2 uppercase tracking-[0.2em]">User Name</label>
              <input
                type="text"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                placeholder="이름을 입력하세요"
                className="w-full bg-slate-100/50 border border-slate-200 text-zinc-800 px-6 py-4 rounded-2xl focus:outline-none focus:ring-4 focus:ring-blue-500/10 transition-all placeholder:text-zinc-400 font-bold"
              />
            </div>

            <button
              onClick={handleStart}
              className="w-full bg-blue-600 text-white py-5 rounded-2xl font-black text-lg hover:bg-blue-700 transition-all active:scale-95 shadow-xl shadow-blue-500/20"
            >
              START GAME
            </button>
          </div>

          {ranking.length > 0 && (
            <div className="mt-10 w-full pt-8 border-t border-slate-200/50">
              <h3 className="text-[10px] font-black text-zinc-300 mb-4 uppercase text-center tracking-[0.3em]">Top 3 Records</h3>
              <div className="space-y-2">
                {ranking.map((entry, idx) => (
                  <div key={idx} className="flex justify-between items-center bg-white/50 px-5 py-3 rounded-xl border border-white/80 shadow-sm">
                    <span className="flex items-center gap-3">
                      <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black text-white ${idx === 0 ? 'bg-amber-400' : idx === 1 ? 'bg-slate-400' : 'bg-amber-700'}`}>
                        {idx + 1}
                      </span>
                      <span className="font-bold text-zinc-700">{entry.name}</span>
                    </span>
                    <span className="font-mono font-bold text-blue-500">{entry.time}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {screen === 'GAME' && (
        <div className="relative flex flex-col items-center">
          {/* HUD Top */}
          <div className="w-full flex justify-between items-center mb-12 px-2">
            <div className="flex bg-white/80 backdrop-blur-md px-6 py-4 rounded-2xl border border-white shadow-xl shadow-blue-900/5 items-center gap-4">
              <div className="text-zinc-400 text-[10px] font-black uppercase tracking-widest">Time</div>
              <div className="text-blue-600 text-3xl font-mono font-black">{formatTime(timer)}</div>
            </div>

            <div className="flex bg-white/80 backdrop-blur-md px-6 py-4 rounded-2xl border border-white shadow-xl shadow-blue-900/5 items-center gap-4">
              <div className="text-zinc-400 text-[10px] font-black uppercase tracking-widest">Lives</div>
              <div className="flex gap-1.5 pt-1">
                {[...Array(3)].map((_, i) => (
                  <span key={i} className={`text-2xl transition-all duration-300 ${i < lives ? 'scale-110 drop-shadow-sm' : 'grayscale opacity-20 scale-90'}`}>❤️</span>
                ))}
              </div>
            </div>
          </div>

          {/* Canvas Wrapper */}
          <div className="relative rounded-[2.5rem] overflow-hidden shadow-2xl shadow-blue-900/10 border-8 border-white bg-white">
            <canvas
              ref={canvasRef}
              width={600}
              height={500}
              className={`w-full max-w-full h-auto touch-none bg-white ${isPaused || countdown > 0 ? 'cursor-default' : 'cursor-none'}`}
            />
            {/* Pause Overlay */}
            {isPaused && countdown === 0 && (
              <div className="absolute inset-0 bg-white/60 backdrop-blur-sm flex items-center justify-center z-10 animate-in fade-in duration-300">
                <div className="text-zinc-900 text-6xl font-black italic tracking-tighter opacity-10 blur-[1px] absolute">PAUSED</div>
                <div className="bg-white p-8 rounded-3xl shadow-2xl flex flex-col items-center gap-6 border border-slate-100 animate-in zoom-in-95 duration-500">
                  <span className="text-4xl font-black text-zinc-800">PAUSED</span>
                  <button 
                    onClick={() => { setIsPaused(false); gameState.current.isPaused = false; }}
                    className="bg-blue-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20"
                  >
                    CONTINUE
                  </button>
                </div>
              </div>
            )}
            {/* Countdown Overlay */}
            {countdown > 0 && (
              <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
                <div className="text-zinc-800 text-[12rem] font-black animate-in zoom-in duration-300 drop-shadow-2xl">{countdown}</div>
              </div>
            )}
          </div>

          {/* Mission Progress HUD */}
          <div className="absolute -top-6 left-1/2 -translate-x-1/2 flex flex-col items-center scale-90 md:scale-100">
             <div className="bg-white/90 backdrop-blur-md px-6 py-3 rounded-full border border-white shadow-xl flex items-center gap-4">
                <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest whitespace-nowrap">RED MISSION</span>
                <div className="flex gap-2">
                  {[...Array(3)].map((_, i) => (
                    <div 
                      key={i} 
                      className={`w-4 h-4 rounded-full transition-all duration-700 border-2 ${
                        i < score ? 'bg-red-500 border-red-400 shadow-lg shadow-red-500/50 scale-125' : 'bg-slate-100 border-slate-200'
                      }`}
                    />
                  ))}
                </div>
             </div>
          </div>

          {/* Controls HUD Bottom */}
          <div className="w-full flex justify-center gap-4 mt-12 pb-12">
            <button
              onClick={() => {
                  const nextPaused = !gameState.current.isPaused;
                  setIsPaused(nextPaused);
                  gameState.current.isPaused = nextPaused;
              }}
              className="glass-panel px-8 py-4 rounded-2xl font-black text-xs text-zinc-600 hover:bg-white hover:text-blue-600 transition-all shadow-xl shadow-blue-900/5 active:scale-95"
            >
              {isPaused ? '▶ CONTINUE' : '⏸ PAUSE'}
            </button>
            <button
              onClick={() => {
                  cleanup();
                  setScreen('START');
                  gameState.current.currentScreen = 'START';
              }}
              className="glass-panel px-8 py-4 rounded-2xl font-black text-xs text-zinc-600 hover:bg-white hover:text-blue-600 transition-all shadow-xl shadow-blue-900/5 active:scale-95"
            >
              ⏹ STOP
            </button>
            <button
              onClick={() => {
                  cleanup();
                  setScreen('START');
                  gameState.current.currentScreen = 'START';
              }}
              className="glass-panel px-8 py-4 rounded-2xl font-black text-xs text-red-500/70 hover:bg-red-50 hover:text-red-600 transition-all shadow-xl shadow-red-900/5 border-red-50 active:scale-95"
            >
              🚪 EXIT
            </button>
          </div>
        </div>
      )}

      {(screen === 'SUCCESS' || screen === 'OVER') && (
        <div className="glass-panel w-full max-w-md p-10 rounded-[2.5rem] flex flex-col items-center text-center animate-in zoom-in-95 duration-500 shadow-2xl shadow-blue-900/10">
          {screen === 'SUCCESS' ? (
            <>
              <div className="w-28 h-28 bg-green-500/10 rounded-full flex items-center justify-center mb-8 border-4 border-white shadow-xl overflow-hidden">
                <span className="text-6xl animate-bounce">🏆</span>
              </div>
              <h2 className="text-5xl font-black mb-2 text-green-500 tracking-tighter uppercase italic">Victory!</h2>
              <p className="text-zinc-500 mb-10 font-bold opacity-60 uppercase tracking-widest text-xs">Mission Accomplished</p>
              
              <div className="bg-slate-50 w-full p-8 rounded-3xl border border-slate-100 mb-10 shadow-inner">
                <p className="text-[10px] text-zinc-400 uppercase font-black tracking-[0.4em] mb-3">Clear Time</p>
                <p className="text-6xl font-mono font-black text-blue-600 tracking-tighter">{formatTime(gameState.current.timer)}</p>
              </div>
            </>
          ) : (
            <>
              <div className="w-28 h-28 bg-red-500/10 rounded-full flex items-center justify-center mb-8 border-4 border-white shadow-xl overflow-hidden">
                <span className="text-6xl animate-pulse">💀</span>
              </div>
              <h2 className="text-5xl font-black mb-2 text-red-500 tracking-tighter uppercase italic">Game Over</h2>
              <p className="text-zinc-500 mb-10 font-bold opacity-60 uppercase tracking-widest text-xs">Better luck next time</p>

              <div className="bg-red-500/5 w-full p-8 rounded-3xl border border-red-500/10 mb-10 shadow-inner">
                <p className="text-[10px] text-red-500/40 uppercase font-black tracking-[0.4em] mb-3">Mission Progress</p>
                <p className="text-6xl font-mono font-black text-red-500 tracking-tighter">{score} <span className="text-2xl text-red-500/30">/ 3</span></p>
              </div>
            </>
          )}

          <div className="w-full space-y-4">
            {ranking.length > 0 && (
              <div className="mb-8 w-full pt-6 border-t border-slate-200/50 text-left">
                <h3 className="text-[10px] font-black text-zinc-300 mb-4 uppercase text-center tracking-[0.3em]">Top 3 Records</h3>
                <div className="space-y-2">
                  {ranking.map((entry, idx) => (
                    <div key={idx} className="flex justify-between items-center bg-white/50 px-4 py-2.5 rounded-xl border border-white/80 shadow-sm">
                      <span className="flex items-center gap-2">
                        <span className={`w-5 h-5 rounded-md flex items-center justify-center text-[9px] font-black text-white ${idx === 0 ? 'bg-amber-400' : idx === 1 ? 'bg-slate-400' : 'bg-amber-700'}`}>
                          {idx + 1}
                        </span>
                        <span className="font-bold text-zinc-600 text-sm">{entry.name}</span>
                      </span>
                      <span className="font-mono font-bold text-blue-500 text-sm">{entry.time}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={() => {
                  cleanup();
                  setScreen('GAME');
                  gameState.current.currentScreen = 'GAME';
              }}
              className={`w-full py-5 rounded-[1.25rem] font-black text-lg transition-all active:scale-95 shadow-xl ${
                screen === 'SUCCESS' ? 'bg-green-500 hover:bg-green-600 text-white shadow-green-500/20' : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/20'
              }`}
            >
              PLAY AGAIN
            </button>
            <button
              onClick={() => {
                  setScreen('START');
                  gameState.current.currentScreen = 'START';
              }}
              className="w-full bg-slate-100 text-zinc-500 py-5 rounded-[1.25rem] font-black text-xs hover:bg-slate-200 transition-all uppercase tracking-widest"
            >
              Main Menu
            </button>
          </div>
        </div>
      )}

      {/* Footer Identification */}
      <div className="fixed bottom-8 left-0 right-0 text-center opacity-40 pointer-events-none">
        <p className="text-[10px] font-black tracking-[0.2em] text-slate-400 uppercase">{CREATOR_INFO}</p>
      </div>

      <style jsx>{`
        canvas {
            touch-action: none;
        }
      `}</style>
    </div>
  );
}
