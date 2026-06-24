import { useEffect, useRef, useState, useCallback } from 'react';
import { io, type Socket } from 'socket.io-client';
import { sceneEvents } from '@/shared/utils/sceneEvents';
import { soundEngine } from '@/shared/utils/soundEngine';
import { classifyProvider } from './liveCatalogue';

const SOCKET_URL = 'https://socket.prod.platform.metawin.com';
const CHANNEL = 'Activity:Globe';

export interface FeedEvent {
  readonly id: string;
  readonly gameName: string;
  readonly amount: number;
  readonly country: string;
  readonly timestamp: number;
  readonly provider: 'gladiator' | 'original' | 'other';
  /** Geographic latitude, null when the server omits coordinates. */
  readonly lat: number | null;
  /** Geographic longitude, null when the server omits coordinates. */
  readonly lng: number | null;
}

// Provider classification comes from the real curated catalogue (./liveCatalogue),
// so every game we ship is recognised, shown in the feed, and beamed onto the globe.

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function parseEvent(raw: unknown, index: number): FeedEvent | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;

  const game = data.game as Record<string, unknown> | undefined;
  const gameName = (game?.name as string) ?? 'Unknown';
  if (!gameName || gameName === 'Unknown') return null;

  const win = data.win as Record<string, unknown> | undefined;
  const amountData = data.amount as Record<string, unknown> | undefined;
  const baseAmount = Number(win?.baseAmount ?? amountData?.base ?? win?.amount ?? 0);

  const location = data.location as Record<string, unknown> | undefined;
  const country = (location?.country as string) ?? '';

  // Resolve lat/lng — mirror EventProcessor.normalizeEvent logic from the feeder:
  // prefer location.lat/lng, fall back to location.latitude/longitude.
  const lat = toFiniteNumber(location?.lat) ?? toFiniteNumber(location?.latitude);
  const lng = toFiniteNumber(location?.lng) ?? toFiniteNumber(location?.longitude);

  return {
    id: `evt_${Date.now()}_${index}`,
    gameName,
    amount: baseAmount,
    country: country.substring(0, 2).toUpperCase() || '??',
    timestamp: Date.now(),
    provider: classifyProvider(gameName),
    lat,
    lng,
  };
}

interface FeederState {
  readonly events: readonly FeedEvent[];
  readonly eventsPerSecond: number;
  readonly totalAmount: number;
  readonly isConnected: boolean;
  readonly gladiatorCount: number;
  readonly originalCount: number;
}

const MAX_EVENTS = 20;
let eventCounter = 0;

export function useFeederSocket(): FeederState {
  const [events, setEvents] = useState<readonly FeedEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [eventsPerSecond, setEventsPerSecond] = useState(0);
  const [totalAmount, setTotalAmount] = useState(0);
  const [gladiatorCount, setGladiatorCount] = useState(0);
  const [originalCount, setOriginalCount] = useState(0);
  const socketRef = useRef<Socket | null>(null);
  const epsCountRef = useRef(0);

  const handleMessage = useCallback((data: unknown) => {
    // The socket server may deliver the envelope in two forms:
    //   1. A plain object:  { type: 'GlobeActivity', payload: { ... } }
    //   2. An array tuple:  ['message', { type: 'GlobeActivity', payload: { ... } }]
    // Unwrap either form to reach the envelope object.
    let envelope: Record<string, unknown> | undefined;
    if (Array.isArray(data) && data.length >= 2 && data[0] === 'message') {
      const candidate = data[1];
      if (candidate && typeof candidate === 'object' && !Array.isArray(candidate) && 'type' in candidate) {
        envelope = candidate as Record<string, unknown>;
      }
    } else if (data && typeof data === 'object' && !Array.isArray(data) && 'type' in data) {
      envelope = data as Record<string, unknown>;
    }

    if (!envelope || envelope.type !== 'GlobeActivity') return;

    const payload = envelope.payload as Record<string, unknown> | undefined;
    if (!payload) return;

    const event = parseEvent(payload, eventCounter++);
    if (!event) return;

    // Filter out third-party games (like feeder's isTrackedGameProvider)
    if (event.provider === 'other') return;

    // Fire effects onto the 3D earth — feeder logic:
    // BIG+ ($1000+) → full beam, normal → small ring ripple
    const beamLat = event.lat ?? (Math.random() - 0.5) * 120;
    const beamLng = event.lng ?? (Math.random() - 0.5) * 300;
    if (event.amount >= 100) {
      // $100+ — beam (gold→amber→red based on amount)
      sceneEvents.emitWin({ lat: beamLat, lng: beamLng, amount: event.amount, gameName: event.gameName });
      if (event.amount >= 1000) { soundEngine.bigWin(); } else { soundEngine.alert(); }
    } else {
      // <$100 — small ring ripple only
      sceneEvents.emitRing({ lat: beamLat, lng: beamLng, amount: event.amount });
    }

    epsCountRef.current += 1;

    setEvents(prev => {
      const updated = [event, ...prev];
      return updated.length > MAX_EVENTS ? updated.slice(0, MAX_EVENTS) : updated;
    });

    setTotalAmount(prev => prev + event.amount);

    if (event.provider === 'gladiator') {
      setGladiatorCount(prev => prev + 1);
    } else {
      setOriginalCount(prev => prev + 1);
    }
  }, []);

  useEffect(() => {
    const socket = io(SOCKET_URL, {
      path: '/connect',
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 50,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
      socket.emitWithAck('subscribe', CHANNEL).catch(() => {
        // Fallback: try emit without ack
        socket.emit('subscribe', CHANNEL);
      });
    });

    socket.on('disconnect', () => setIsConnected(false));
    socket.on('message', handleMessage);

    // EPS counter
    const epsInterval = setInterval(() => {
      setEventsPerSecond(epsCountRef.current);
      epsCountRef.current = 0;
    }, 1000);

    return () => {
      clearInterval(epsInterval);
      socket.off('message', handleMessage);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [handleMessage]);

  return { events, eventsPerSecond, totalAmount, isConnected, gladiatorCount, originalCount };
}
