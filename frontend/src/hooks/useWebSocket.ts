import { useEffect, useState, useCallback, useRef } from 'react';
import { wsManager, WSDeviceStatusUpdate, WSMetricsUpdate } from '@/lib/ws';

export function useWebSocketConnection() {
  const [isConnected, setIsConnected] = useState(wsManager.isConnected);

  useEffect(() => {
    const unsubConnect = wsManager.on('connected', () => setIsConnected(true));
    const unsubDisconnect = wsManager.on('disconnected', () => setIsConnected(false));

    wsManager.connect();

    return () => {
      unsubConnect();
      unsubDisconnect();
    };
  }, []);

  const reconnect = useCallback(() => {
    wsManager.disconnect();
    wsManager.connect();
  }, []);

  return { isConnected, reconnect };
}

export function useDeviceStatusUpdates(onUpdate?: (update: WSDeviceStatusUpdate) => void) {
  const [deviceStatuses, setDeviceStatuses] = useState<Map<string, WSDeviceStatusUpdate>>(new Map());
  const callbackRef = useRef(onUpdate);
  callbackRef.current = onUpdate;

  useEffect(() => {
    const unsubscribe = wsManager.on('device_status', (data: WSDeviceStatusUpdate) => {
      setDeviceStatuses((prev) => {
        const next = new Map(prev);
        next.set(data.machineId, data);
        return next;
      });
      callbackRef.current?.(data);
    });

    return unsubscribe;
  }, []);

  return deviceStatuses;
}

export function useMetricsUpdates(onUpdate?: (update: WSMetricsUpdate) => void) {
  const [metrics, setMetrics] = useState<WSMetricsUpdate | null>(null);
  const callbackRef = useRef(onUpdate);
  callbackRef.current = onUpdate;

  useEffect(() => {
    const unsubscribe = wsManager.on('metrics_update', (data: WSMetricsUpdate) => {
      setMetrics(data);
      callbackRef.current?.(data);
    });

    return unsubscribe;
  }, []);

  return metrics;
}
