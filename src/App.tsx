/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Home, 
  MapPin, 
  Maximize2, 
  ChevronRight, 
  ChevronLeft, 
  Trophy, 
  RefreshCcw, 
  Landmark,
  ExternalLink,
  Target,
  X,
  Layers
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';

// Fix Leaflet icon issue
// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

import listingsData from './data/listings.json';

// --- Types ---
interface Listing {
  id: string;
  title: string;
  locality: string;
  m2_size: number;
  type: string;
  price_czk: number;
  coordinates: { lat: number; lng: number };
  original_url: string;
  specs: {
    stavi: string;
    vlastnictvi: string;
    podlazi: string;
    energeticka_narocnost: string;
    vytah: string;
    parkovani?: string;
    sklep?: string;
    balkon?: string;
    terasa?: string;
    zahrada?: string;
    garaz?: string;
  };
  image_urls: string[];
  description: string;
}

type GameState = 'playing' | 'revealed' | 'finished';
type GameMode = 'classic' | 'map';

// --- Utilities ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function formatCZK(value: number) {
  return new Intl.NumberFormat('cs-CZ', {
    style: 'currency',
    currency: 'CZK',
    maximumFractionDigits: 0,
  }).format(value);
}

// --- Components ---

export default function App() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [gameState, setGameState] = useState<GameState>('playing');
  const [gameMode, setGameMode] = useState<GameMode>('classic');
  const [totalRounds, setTotalRounds] = useState(10);
  const [guessedIndices, setGuessedIndices] = useState<number[]>([]);
  const [guess, setGuess] = useState<string>('');
  const [totalScore, setTotalScore] = useState(0);
  const [currentScore, setCurrentScore] = useState(0);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [showIntro, setShowIntro] = useState(true);
  const [showMap, setShowMap] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const thumbnailContainerRef = useRef<HTMLDivElement>(null);
  const activeThumbnailRef = useRef<HTMLButtonElement>(null);

  const listings = useMemo(() => {
    const all = (listingsData as Listing[]).map(listing => ({
      ...listing,
      image_urls: listing.image_urls || []
    }));
    // Filter out any properties that might have escaped the scraper check (sanity check)
    // and those with price 1 or 0
    return all.filter(l => l.price_czk > 1000 && l.image_urls.length > 0).sort(() => Math.random() - 0.5);
  }, []);

  const sessionListings = useMemo(() => {
    if (gameMode === 'classic') {
      return listings.slice(0, totalRounds);
    }
    return listings;
  }, [listings, gameMode, totalRounds]);

  const currentListing = sessionListings[currentIndex];

  useEffect(() => {
    if (activeThumbnailRef.current && thumbnailContainerRef.current) {
      const container = thumbnailContainerRef.current;
      const thumbnail = activeThumbnailRef.current;
      
      const scrollLeft = thumbnail.offsetLeft - (container.clientWidth / 2) + (thumbnail.clientWidth / 2);
      container.scrollTo({
        left: scrollLeft,
        behavior: 'smooth'
      });
    }

    // Preload current listing's next images
    if (currentListing) {
      const nextImages = currentListing.image_urls.slice(currentImageIndex + 1, currentImageIndex + 4);
      nextImages.forEach(url => {
        const img = new Image();
        img.src = url;
      });
    }

    // Preload next listing's first image in classic mode
    if (gameMode === 'classic' && currentIndex < sessionListings.length - 1) {
      const nextListing = sessionListings[currentIndex + 1];
      if (nextListing && nextListing.image_urls.length > 0) {
        const img = new Image();
        img.src = nextListing.image_urls[0];
      }
    }
  }, [currentImageIndex, currentListing, currentIndex, gameMode, sessionListings]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
        return;
      }

      if (currentListing && currentListing.image_urls.length > 1) {
        if (e.key === 'ArrowLeft') {
          setCurrentImageIndex(prev => (prev - 1 + currentListing.image_urls.length) % currentListing.image_urls.length);
        } else if (e.key === 'ArrowRight') {
          setCurrentImageIndex(prev => (prev + 1) % currentListing.image_urls.length);
        }
      }

      if (e.key === 'Escape' && isFullScreen) {
        setIsFullScreen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentListing, isFullScreen]);

  const handleGuess = () => {
    if (!guess || isNaN(Number(guess)) || !currentListing) return;

    const userGuess = Number(guess);
    const actual = currentListing.price_czk;
    const diff = Math.abs(userGuess - actual);
    
    // Proximity score: 5000 max if perfect, 0 if off by more than 50%
    const percentageOff = diff / actual;
    const score = Math.max(0, Math.floor(5000 * (1 - Math.min(1, percentageOff * 2))));
    
    setCurrentScore(score);
    setTotalScore(prev => prev + score);
    setGameState('revealed');
    
    if (gameMode === 'map') {
      setGuessedIndices(prev => [...prev, currentIndex]);
    }
  };

  const nextProperty = () => {
    if (gameMode === 'classic') {
      if (currentIndex < sessionListings.length - 1) {
        setCurrentIndex(prev => prev + 1);
        setGameState('playing');
        setGuess('');
        setCurrentImageIndex(0);
        setCurrentScore(0);
      } else {
        setGameState('finished');
      }
    } else {
      // Map mode: go back to selection map
      setCurrentIndex(-1);
      setGameState('playing');
      setGuess('');
      setCurrentImageIndex(0);
      setCurrentScore(0);
      
      // If all are guessed, finish
      if (guessedIndices.length >= sessionListings.length) {
        setGameState('finished');
      }
    }
  };

  const restartGame = () => {
    setCurrentIndex(0);
    setGameState('playing');
    setTotalScore(0);
    setGuessedIndices([]);
    setGuess('');
    setCurrentImageIndex(0);
    setShowIntro(true);
  };

  const startGame = (mode: GameMode) => {
    setGameMode(mode);
    setShowIntro(false);
    
    // For map mode, start with no selection
    if (mode === 'map') {
      setCurrentIndex(-1);
    } else {
      setCurrentIndex(0);
    }
  };

  if (showIntro) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950 p-6">
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full text-center space-y-8"
        >
          <div className="relative flex items-center justify-center mb-4">
            <div className="w-20 h-20 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center shadow-2xl">
              <Home className="w-10 h-10 text-cz-blue" />
            </div>
            <div className="absolute -bottom-2 -right-2 w-10 h-10 rounded-full bg-cz-red flex items-center justify-center border-4 border-zinc-950 shadow-xl">
              <Target className="w-5 h-5 text-white" />
            </div>
          </div>
          <div className="space-y-4">
            <h1 className="text-5xl font-black tracking-tighter text-white uppercase italic">
              Cenová <span className="text-cz-red">Trefa</span>
            </h1>
            <p className="text-zinc-500 text-xs font-bold uppercase tracking-[0.3em] leading-relaxed max-w-[280px] mx-auto">
              Staňte se mistrem českého realitního trhu
            </p>
          </div>

          <div className="pt-4 px-8 space-y-6">
            <div className="space-y-3">
              <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest text-left ml-1">Počet kol</div>
              <div className="flex gap-2">
                {[5, 10, 20].map((num) => (
                  <button
                    key={num}
                    onClick={() => setTotalRounds(num)}
                    className={cn(
                      "flex-1 py-3 rounded-lg font-bold text-sm transition-all border",
                      totalRounds === num 
                        ? "bg-cz-blue/20 border-cz-blue text-cz-blue shadow-lg shadow-cz-blue/10" 
                        : "bg-zinc-900 border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"
                    )}
                  >
                    {num}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => startGame('classic')}
                className="w-full py-4 px-8 bg-cz-red text-white font-bold rounded-lg hover:filter hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-4 group uppercase tracking-widest text-sm"
              >
                <div className="flex flex-col items-start">
                  <span className="text-xs opacity-70">Klasický režim</span>
                  <span>Začít hru</span>
                </div>
                <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform ml-auto" />
              </button>

              <button
                onClick={() => startGame('map')}
                className="w-full py-4 px-8 bg-zinc-800 border border-zinc-700 text-white font-bold rounded-lg hover:bg-zinc-700 active:scale-[0.98] transition-all flex items-center justify-center gap-4 group uppercase tracking-widest text-sm"
              >
                <div className="flex flex-col items-start">
                  <span className="text-xs opacity-70">Mapa režim</span>
                  <span>Průzkum lokality</span>
                </div>
                <MapPin className="w-4 h-4 group-hover:scale-110 transition-transform ml-auto text-cz-blue" />
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  if (gameState === 'finished') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950 p-6">
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="max-w-md w-full bg-zinc-900 border border-zinc-800 rounded-lg p-10 text-center space-y-8 shadow-2xl"
        >
          <div className="space-y-2">
            <div className="text-[11px] font-bold text-zinc-500 uppercase tracking-[0.2em]">Konec simulace</div>
            <h2 className="text-3xl font-bold text-white">Vaše výsledky</h2>
          </div>

          <div className="bg-zinc-950 rounded-lg p-8 border border-zinc-800">
            <div className="text-[11px] font-bold text-zinc-500 uppercase tracking-[0.2em] mb-2">Celkové skóre</div>
            <div className="text-5xl font-black text-white tracking-tighter">
              {totalScore.toLocaleString()}
            </div>
          </div>

          <button
            onClick={restartGame}
            className="w-full py-4 bg-cz-blue text-white font-bold rounded-lg hover:filter hover:brightness-110 transition-all flex items-center justify-center gap-2 uppercase tracking-widest text-sm"
          >
            <RefreshCcw className="w-4 h-4" />
            Zkusit znovu
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full bg-zinc-950 text-zinc-100 flex flex-col font-sans select-none overflow-x-hidden">
      {/* --- Header --- */}
      <header className="h-16 shrink-0 border-b border-zinc-800 flex items-center justify-between px-8 bg-zinc-950 z-30">
        <button 
          onClick={restartGame}
          className="flex items-center gap-3 hover:opacity-80 transition-opacity cursor-pointer group text-left"
        >
          <div className="relative flex items-center justify-center">
            <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center group-hover:border-cz-blue transition-colors">
              <Home className="w-4 h-4 text-cz-blue" />
            </div>
            <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-cz-red flex items-center justify-center border-2 border-zinc-950 shadow-sm">
              <Target className="w-2 h-2 text-white" />
            </div>
          </div>
          <div className="flex flex-col -gap-1">
            <span className="text-[15px] font-black tracking-tighter uppercase leading-none text-white group-hover:text-cz-blue transition-colors">Cenová Trefa</span>
            <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-[0.2em] group-hover:text-zinc-400 transition-colors">Realitní Hra</span>
          </div>
        </button>
        
        <div className="flex items-center gap-8">
          <button 
            onClick={restartGame}
            className="text-[11px] font-bold text-zinc-500 hover:text-white uppercase tracking-widest transition-colors flex items-center gap-1.5"
          >
            <RefreshCcw className="w-3 h-3" />
            Menu
          </button>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest">
              {gameMode === 'classic' ? 'Kolo' : 'Splněno'}
            </span>
            <span className="text-sm font-bold text-zinc-100">
              {gameMode === 'classic' ? currentIndex + 1 : guessedIndices.length} / {sessionListings.length}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest">Skóre</span>
            <span className="text-sm font-bold text-zinc-100">{totalScore.toLocaleString()}</span>
          </div>
        </div>
      </header>

      {/* --- Main Contents --- */}
      <main className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] overflow-hidden">
        {/* Map Modal */}
        <AnimatePresence>
          {showMap && currentListing && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/90 backdrop-blur-md z-[100] flex items-center justify-center p-4 md:p-12 mb-0"
            >
              <motion.div 
                initial={{ scale: 0.95, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.95, y: 20 }}
                className="bg-zinc-950 border border-zinc-800 rounded-lg w-full max-w-5xl h-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden"
              >
                <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-900">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-cz-red" />
                    <span className="text-sm font-bold uppercase tracking-widest">{currentListing.locality}</span>
                  </div>
                  <button 
                    onClick={() => setShowMap(false)}
                    className="p-2 hover:bg-zinc-800 rounded-md transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex-1 bg-zinc-800 relative">
                  {(currentListing.coordinates?.lat && currentListing.coordinates?.lng) ? (
                    <MapContainer 
                      center={[currentListing.coordinates.lat, currentListing.coordinates.lng]} 
                      zoom={15} 
                      style={{ height: '100%', width: '100%' }}
                      scrollWheelZoom={true}
                    >
                      <TileLayer
                        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                        attribution='&copy; CARTO'
                      />
                      <Marker position={[currentListing.coordinates.lat, currentListing.coordinates.lng]}>
                        <Popup>
                          <div className="text-zinc-900 font-bold">{currentListing.locality}</div>
                        </Popup>
                      </Marker>
                    </MapContainer>
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-zinc-500 gap-4 bg-zinc-900">
                      <MapPin className="w-12 h-12 opacity-20" />
                      <div className="text-center">
                        <div className="font-bold text-zinc-400">Mapa není k dispozici</div>
                        <div className="text-sm opacity-50 px-10">Lokalita: {currentListing.locality}</div>
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Full Screen Image Overlay */}
        <AnimatePresence>
          {isFullScreen && currentListing && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/98 z-[200] flex flex-col p-4 md:p-8"
              onClick={() => setIsFullScreen(false)}
            >
              <div className="absolute top-6 right-6 z-10">
                <button 
                  onClick={() => setIsFullScreen(false)}
                  className="p-3 bg-white/10 hover:bg-white/20 rounded-full transition-colors text-white"
                >
                  <X className="w-8 h-8" />
                </button>
              </div>

              <div className="flex-1 min-h-0 relative flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
                  <motion.img
                    key={currentImageIndex}
                    src={currentListing.image_urls[currentImageIndex]}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="max-w-full max-h-full object-contain shadow-2xl"
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.style.display = 'none';
                    }}
                  />

                {currentListing.image_urls.length > 1 && (
                  <>
                    <button 
                      onClick={() => setCurrentImageIndex(prev => (prev - 1 + currentListing.image_urls.length) % currentListing.image_urls.length)}
                      className="absolute left-0 top-1/2 -translate-y-1/2 p-4 text-white/50 hover:text-white transition-colors"
                    >
                      <ChevronLeft className="w-12 h-12" />
                    </button>
                    <button 
                      onClick={() => setCurrentImageIndex(prev => (prev + 1) % currentListing.image_urls.length)}
                      className="absolute right-0 top-1/2 -translate-y-1/2 p-4 text-white/50 hover:text-white transition-colors"
                    >
                      <ChevronRight className="w-12 h-12" />
                    </button>
                  </>
                )}
              </div>
              
              <div className="h-24 mt-4 flex justify-center gap-2 overflow-x-auto scrollbar-hide py-2 w-full min-w-0" onClick={(e) => e.stopPropagation()}>
                {currentListing.image_urls.map((url, idx) => (
                  <button
                    key={idx}
                    onClick={() => setCurrentImageIndex(idx)}
                    className={cn(
                      "h-full aspect-[4/3] rounded-sm border transition-all overflow-hidden shrink-0",
                      currentImageIndex === idx ? "border-white border-2 scale-105" : "border-white/10 opacity-30 hover:opacity-100"
                    )}
                  >
                    <img 
                      src={url} 
                      className="w-full h-full object-cover" 
                      alt="" 
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                      }}
                    />
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex-1 min-w-0 relative bg-zinc-950 flex flex-col min-h-0 overflow-hidden">
          {/* Main Map View (Selection) */}
          {gameMode === 'map' && currentIndex === -1 && (
            <div className="absolute inset-0 z-0">
              <MapContainer 
                center={[49.8, 15.5]} 
                zoom={7} 
                style={{ height: '100%', width: '100%' }}
                className="z-0"
                scrollWheelZoom={true}
              >
                <TileLayer
                  url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                  attribution='&copy; CARTO'
                />
                {listings.map((item, idx) => (
                  <Marker 
                    key={item.id} 
                    position={[item.coordinates.lat, item.coordinates.lng]}
                    icon={L.divIcon({
                      html: `<div class="flex flex-col items-center group">
                        <div class="w-8 h-8 rounded-full border-2 border-white flex items-center justify-center shadow-lg transition-all ${guessedIndices.includes(idx) ? 'bg-zinc-600 opacity-50' : 'bg-cz-blue hover:scale-110'}">
                          <div class="w-1.5 h-1.5 rounded-full bg-white"></div>
                        </div>
                      </div>`,
                      className: '',
                      iconSize: [32, 32],
                      iconAnchor: [16, 16],
                    })}
                    eventHandlers={{
                      click: () => {
                        setCurrentIndex(idx);
                        if (!guessedIndices.includes(idx)) {
                          setGameState('playing');
                          setGuess('');
                        } else {
                          setGameState('revealed');
                        }
                      },
                    }}
                  />
                ))}
              </MapContainer>
              
              {/* Map Mode Overlay Info */}
              <div className="absolute bottom-6 left-6 z-20 pointer-events-none">
                <div className="bg-zinc-900/80 backdrop-blur-md border border-zinc-800 p-4 rounded-lg shadow-2xl max-w-xs">
                  <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Režim Průzkum</div>
                  <h3 className="text-sm font-bold text-white mb-2">Vyberte nemovitost na mapě</h3>
                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    Klikněte na libovolnou značku pro zahájení odhadu ceny.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Gallery Section - In map mode we'll show it as a floating panel or overlay if visible */}
          {(gameMode === 'classic' || (gameMode === 'map' && currentIndex !== -1)) && (
            <AnimatePresence>
              <motion.section 
                initial={gameMode === 'map' ? { opacity: 0, x: -20 } : false}
                animate={{ opacity: 1, x: 0 }}
                className={cn(
                  "relative flex flex-col p-4 gap-4 bg-zinc-950 overflow-hidden w-full min-w-0",
                  "h-full"
                )}
              >
                {gameMode === 'map' && (
                  <button 
                    onClick={() => setCurrentIndex(-1)}
                    className="absolute top-4 right-4 p-2 bg-zinc-800 hover:bg-zinc-700 rounded-full text-zinc-400 hover:text-white transition-all z-20"
                    title="Zavřít detail"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
                <div 
                  className="flex-1 bg-zinc-900 rounded-sm border border-zinc-800 overflow-hidden relative group cursor-zoom-in flex items-center justify-center"
                  onClick={() => setIsFullScreen(true)}
                >
                  <AnimatePresence mode="wait">
                    <motion.img
                      key={`${currentIndex}-${currentImageIndex}`}
                      src={(currentListing?.image_urls && currentListing.image_urls.length > currentImageIndex)
                        ? currentListing.image_urls[currentImageIndex]
                        : ""
                      }
                      initial={{ opacity: 0, scale: 1.02 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.98 }}
                      transition={{ duration: 0.3, ease: "easeOut" }}
                      className="max-w-full max-h-full object-contain"
                      alt="Property"
                      referrerPolicy="no-referrer"
                      loading="eager"
                      decoding="async"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        console.log('Image failed to load:', target.src);
                        // If it's the first image failing, it might be due to referrer or encoding
                        // We already have no-referrer and replace (| -> %7C)
                        target.style.display = 'none';
                      }}
                    />
                  </AnimatePresence>
                  
                  {/* Overlay with image counter */}
                  <div className="absolute top-4 right-4 px-3 py-1 bg-black/60 backdrop-blur-md border border-white/10 rounded-full text-[10px] font-bold tracking-widest text-white/80 pointer-events-none">
                    {(currentImageIndex + 1)} / {Math.max(1, currentListing?.image_urls?.length || 0)} fotos
                  </div>

              {/* Gallery Navigation Controls (Geometric) */}
              {currentListing.image_urls.length > 1 && (
                <div className="absolute inset-x-0 inset-y-0 p-6 flex justify-between items-center opacity-0 group-hover:opacity-100 transition-all">
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setCurrentImageIndex(prev => (prev - 1 + currentListing.image_urls.length) % currentListing.image_urls.length);
                    }}
                    className="w-12 h-12 bg-white text-black flex items-center justify-center hover:scale-110 active:scale-95 transition-all shadow-xl"
                    aria-label="Previous"
                  >
                    <ChevronLeft className="w-6 h-6" />
                  </button>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setCurrentImageIndex(prev => (prev + 1) % currentListing.image_urls.length);
                    }}
                    className="w-12 h-12 bg-white text-black flex items-center justify-center hover:scale-110 active:scale-95 transition-all shadow-xl"
                    aria-label="Next"
                  >
                    <ChevronRight className="w-6 h-6" />
                  </button>
                </div>
              )}
            </div>

            {/* Thumbnails (Geometric Grid) */}
            {currentListing.image_urls.length > 0 && (
              <div 
                ref={thumbnailContainerRef}
                className="w-full min-h-20 max-h-24 overflow-x-auto overflow-y-hidden scrollbar-hide py-1 scroll-smooth"
                style={{ WebkitOverflowScrolling: 'touch' }}
              >
                <div className="flex gap-2 h-full w-max px-4">
                  {currentListing.image_urls.map((url, idx) => (
                    <button
                      key={idx}
                      ref={currentImageIndex === idx ? activeThumbnailRef : null}
                      onClick={() => setCurrentImageIndex(idx)}
                      className={cn(
                        "h-full aspect-[4/3] relative rounded-sm border transition-all overflow-hidden bg-zinc-900 shrink-0",
                        currentImageIndex === idx ? "border-cz-blue border-2 scale-[1.02] z-10" : "border-zinc-800 opacity-50 hover:opacity-100"
                      )}
                    >
                    <img 
                      src={url} 
                      className="w-full h-full object-cover" 
                      alt="" 
                      referrerPolicy="no-referrer"
                      loading="lazy"
                      decoding="async"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                      }}
                    />
                    </button>
                  ))}
                </div>
              </div>
            )}
            </motion.section>
            </AnimatePresence>
          )}
        </div>

        {/* Control Panel Section */}
        <aside className="w-full lg:w-[380px] shrink-0 bg-zinc-900 border-l border-zinc-800 p-10 flex flex-col overflow-y-auto">
          {currentListing ? (
            <>
              <div className="mb-8">
                <div className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Aktuální objekt</div>
                <h1 className="text-2xl font-bold text-white mb-1">{currentListing.title}</h1>
                <button 
                  onClick={() => setShowMap(true)}
                  className="flex items-center gap-1.5 text-zinc-400 text-[14px] hover:text-cz-blue transition-colors group"
                >
                  <MapPin className="w-3.5 h-3.5 text-zinc-500 group-hover:text-cz-blue transition-colors" />
                  <span className="underline decoration-zinc-800 underline-offset-4 group-hover:decoration-cz-blue">
                    {currentListing.locality}
                  </span>
                  <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-4">
                <div className="bg-zinc-950 p-4 border border-zinc-800 rounded-sm">
                  <div className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5">Plocha</div>
                  <div className="text-lg font-bold text-zinc-100">{currentListing.m2_size} m²</div>
                </div>
                <div className="bg-zinc-950 p-4 border border-zinc-800 rounded-sm">
                  <div className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5">Dispozice</div>
                  <div className="text-lg font-bold text-zinc-100">{currentListing.type}</div>
                </div>
                <div className="bg-zinc-950 p-4 border border-zinc-800 rounded-sm">
                  <div className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5">Stav</div>
                  <div className="text-lg font-bold text-zinc-100">{currentListing.specs.stavi}</div>
                </div>
                <div className="bg-zinc-950 p-4 border border-zinc-800 rounded-sm">
                  <div className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5">Podlaží</div>
                  <div className="text-lg font-bold text-zinc-100">{currentListing.specs.podlazi}</div>
                </div>
                <div className="bg-zinc-950 p-4 border border-zinc-800 rounded-sm">
                  <div className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5">Vlastnictví</div>
                  <div className="text-lg font-bold text-zinc-100">{currentListing.specs.vlastnictvi}</div>
                </div>
                <div className="bg-zinc-950 p-4 border border-zinc-800 rounded-sm">
                  <div className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5">PENB</div>
                  <div className="text-lg font-bold text-zinc-100">{currentListing.specs.energeticka_narocnost.split(' ')[0]}</div>
                </div>
              </div>

              {(currentListing.specs.parkovani || currentListing.specs.garaz || currentListing.specs.sklep || currentListing.specs.balkon || currentListing.specs.terasa || currentListing.specs.zahrada) && (
                <div className="mb-6">
                  <div className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Extra vybavení</div>
                  <div className="flex flex-wrap gap-2">
                    {currentListing.specs.parkovani && <span className="px-2 py-1 bg-zinc-800 text-[10px] text-zinc-300 rounded uppercase tracking-wider">{currentListing.specs.parkovani}</span>}
                    {currentListing.specs.garaz && <span className="px-2 py-1 bg-zinc-800 text-[10px] text-zinc-300 rounded uppercase tracking-wider">Garáž: {currentListing.specs.garaz}</span>}
                    {currentListing.specs.sklep && <span className="px-2 py-1 bg-zinc-800 text-[10px] text-zinc-300 rounded uppercase tracking-wider">Sklep: {currentListing.specs.sklep}</span>}
                    {currentListing.specs.balkon && <span className="px-2 py-1 bg-zinc-800 text-[10px] text-zinc-300 rounded uppercase tracking-wider">Balkón: {currentListing.specs.balkon}</span>}
                    {currentListing.specs.terasa && <span className="px-2 py-1 bg-zinc-800 text-[10px] text-zinc-300 rounded uppercase tracking-wider">Terasa: {currentListing.specs.terasa}</span>}
                    {currentListing.specs.zahrada && <span className="px-2 py-1 bg-zinc-800 text-[10px] text-zinc-300 rounded uppercase tracking-wider">Zahrada: {currentListing.specs.zahrada}</span>}
                  </div>
                </div>
              )}

              {currentListing.description && (
                <div className="mb-6">
                  <div className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Popis nemovitosti</div>
                  <div className="text-xs text-zinc-400 leading-relaxed line-clamp-3 hover:line-clamp-none transition-all cursor-pointer bg-zinc-950/50 p-3 rounded border border-zinc-800/50">
                    {currentListing.description}
                  </div>
                </div>
              )}

              {/* Interaction Area / Guess Container */}
              <div className="mt-auto pt-8">
                <AnimatePresence mode="wait">
                  {gameState === 'playing' ? (
                    <motion.div 
                      key="guess-input"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="space-y-4"
                    >
                      <div className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Váš odhad ceny</div>
                      <div className="relative">
                        <input
                          type="text"
                          autoFocus
                          placeholder="0"
                          className="w-full bg-zinc-950 border-2 border-zinc-800 rounded-lg py-5 px-6 text-3xl font-bold transition-all outline-none focus:border-cz-blue"
                          value={guess.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}
                          onChange={(e) => {
                            const val = e.target.value.replace(/\s/g, '').replace(/,/g, '.');
                            if (/^\d*\.?\d*$/.test(val)) setGuess(val);
                          }}
                          onKeyDown={(e) => e.key === 'Enter' && handleGuess()}
                        />
                        <span className="absolute right-6 top-1/2 -translate-y-1/2 text-lg font-bold text-zinc-600">Kč</span>
                      </div>
                      <button
                        onClick={handleGuess}
                        className="w-full py-5 bg-cz-red text-white font-bold rounded-lg hover:filter hover:brightness-110 active:scale-[0.98] transition-all uppercase tracking-widest text-sm shadow-lg shadow-cz-red/10"
                      >
                        Tipnout cenu
                      </button>
                      <div className="mt-6 p-4 rounded-lg bg-cz-blue/10 border border-cz-blue/20">
                         <span className="text-[11px] font-bold text-zinc-100 uppercase mr-2 tracking-widest">Tržní info:</span>
                         <p className="text-zinc-400 text-xs leading-relaxed mt-1">
                          Ceny v této lokalitě se mohou výrazně měnit podle stavu. Průměr: <span className="text-cz-blue font-bold">120k+ / m²</span>.
                         </p>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div 
                      key="guess-reveal"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-6"
                    >
                      <div className="p-6 bg-zinc-950 border border-zinc-800 rounded-lg space-y-4 text-center">
                        <div>
                          <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Skutečná cena</div>
                          <div className="text-2xl font-black text-white">
                            {formatCZK(currentListing.price_czk)}
                          </div>
                        </div>
                        <div className="h-px bg-zinc-800" />
                        <div className="flex justify-around items-center">
                          <div>
                            <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Váš tip</div>
                            <div className="text-sm font-bold text-zinc-400">{formatCZK(Number(guess))}</div>
                          </div>
                          <div className="w-px h-8 bg-zinc-800" />
                          <div>
                            <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Body</div>
                            <div className="text-sm font-bold text-cz-blue">+{currentScore.toLocaleString()}</div>
                          </div>
                        </div>
                        <div className="pt-2">
                          <a 
                            href={currentListing.original_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-zinc-500 hover:text-white transition-colors"
                          >
                            Podobné nabídky na Sreality
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          if (gameMode === 'classic') {
                            nextProperty();
                          } else {
                            setCurrentIndex(-1);
                            setGameState('playing');
                            setGuess('');
                            setCurrentImageIndex(0);
                            setCurrentScore(0);
                          }
                        }}
                        className="w-full py-5 bg-cz-blue text-white font-bold rounded-lg hover:filter hover:brightness-110 active:scale-[0.98] transition-all uppercase tracking-widest text-sm"
                      >
                        {gameMode === 'classic' ? 'Další nemovitost' : 'Pokračovat v průzkumu'}
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 text-center gap-6">
              <div className="w-20 h-20 rounded-full bg-zinc-800 flex items-center justify-center">
                <Target className="w-10 h-10 opacity-20" />
              </div>
              <div className="space-y-2 px-8">
                <h3 className="text-sm font-bold text-zinc-300 uppercase tracking-widest leading-relaxed">
                  Vyberte objekt na mapě
                </h3>
                <p className="text-xs text-zinc-500 leading-relaxed">
                  Klikněte na marker na mapě pro zobrazení detailů a tipování ceny.
                </p>
              </div>
            </div>
          )}
        </aside>
      </main>
    </div>
  );
}
