import { useEffect, useState, useCallback, useRef } from 'react';
import { wsManager, WSDeviceStatusUpdate, WSMetricsUpdate, WSNotification } from '@/lib/api';

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

export function useNotifications() {
  const [notifications, setNotifications] = useState<WSNotification[]>([]);

  useEffect(() => {
    const unsubscribe = wsManager.on('notification', (data: WSNotification) => {
      setNotifications((prev) => [data, ...prev].slice(0, 50)); // Keep last 50
    });

    return unsubscribe;
  }, []);

  const clearNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  return { notifications, clearNotification, clearAll };
}

export function useACLUpdates(onUpdate?: (data: any) => void) {
  const callbackRef = useRef(onUpdate);
  callbackRef.current = onUpdate;

  useEffect(() => {
    const unsubscribe = wsManager.on('acl_update', (data: any) => {
      callbackRef.current?.(data);
    });

    return unsubscribe;
  }, []);
}

export function useWebSocketEvent<T = any>(event: string, onEvent?: (data: T) => void) {
  const [lastData, setLastData] = useState<T | null>(null);
  const callbackRef = useRef(onEvent);
  callbackRef.current = onEvent;

  useEffect(() => {
    const unsubscribe = wsManager.on(event, (data: T) => {
      setLastData(data);
      callbackRef.current?.(data);
    });

    return unsubscribe;
  }, [event]);

  return lastData;
}

export function useRealtimeDevices(initialDevices: any[]) {
  const [devices, setDevices] = useState(initialDevices);
  
  useEffect(() => {
    setDevices(initialDevices);
  }, [initialDevices]);

  useDeviceStatusUpdates((update) => {
    setDevices((prev) =>
      prev.map((device) =>
        device.id === update.machineId
          ? {
              ...device,
              online: update.online,
              lastSeen: update.lastSeen,
              ipAddresses: update.ipAddresses,
            }
          : device
      )
    );
  });

  return devices;
}
