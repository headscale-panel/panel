/*
 * Copyright (C) 2026 
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

import type { WSDeviceStatusUpdate, WSMetricsUpdate } from '@/lib/ws';
import { useCallback, useEffect, useRef, useState } from 'react';
import { wsManager } from '@/lib/ws';

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
