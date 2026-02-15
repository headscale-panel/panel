import { Card } from '@/components/ui/card';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { Copy, Terminal, Wifi, ZoomIn, ZoomOut, Maximize2, AlertCircle, Laptop, Smartphone, Monitor, Tablet, Server, Move, Eye, EyeOff, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from '@/i18n/index';

// Maximum devices to show per user before collapsing
const MAX_VISIBLE_DEVICES_PER_USER = 6;

interface Device {
  id: string;
  name: string;
  type: 'laptop' | 'phone' | 'desktop' | 'tablet' | 'server';
  ip: string;
  online: boolean;
  userId: string;
  userName?: string;
  lastSeen?: string;
}

interface User {  
  id: string;
  name: string;
  avatar?: string;
  online: boolean;
  deviceCount: number;
}

interface ACLRule {
  src: string;
  dst: string;
  action: 'accept' | 'deny';
}

interface ACLPolicy {
  groups?: Record<string, string[]>;
  hosts?: Record<string, string>;
}

interface TopologyData {
  server: { id: string; name: string };
  users: User[];
  devices: Device[];
  acl: ACLRule[];
  policy?: ACLPolicy;
}

interface NetworkTopologyProps {
  data?: {
    users: Array<{
      id: string;
      name: string;
      deviceCount: number;
    }>;
    devices: Array<{
      id: string;
      name: string;
      user: string;
      online: boolean;
      ipAddresses: string[];
      lastSeen: string;
    }>;
    acl: Array<{
      src: string;
      dst: string;
      action: 'accept' | 'deny';
    }>;
    policy?: {
      groups?: Record<string, string[]>;
      hosts?: Record<string, string>;
    };
  } | null;
  deviceStatuses?: Map<string, any>;
}

// Infer device type from name
const inferDeviceType = (name: string): Device['type'] => {
  const lowerName = name.toLowerCase();
  if (lowerName.includes('iphone') || lowerName.includes('android') || lowerName.includes('phone') || lowerName.includes('pixel') || lowerName.includes('mobile')) {
    return 'phone';
  }
  if (lowerName.includes('ipad') || lowerName.includes('tablet') || lowerName.includes('surface') || lowerName.includes('pad')) {
    return 'tablet';
  }
  if (lowerName.includes('macbook') || lowerName.includes('laptop') || lowerName.includes('thinkpad') || lowerName.includes('thinkbook') || lowerName.includes('notebook') || lowerName.includes('mba')) {
    return 'laptop';
  }
  if (lowerName.includes('server') || lowerName.includes('nas') || lowerName.includes('raspberry') || lowerName.includes('pi') || lowerName.includes('vault') || lowerName.includes('kvm') || lowerName.includes('openwrt') || lowerName.includes('cloud') || lowerName.includes('dev')) {
    return 'server';
  }
  return 'desktop';
};

// Collision detection within sector boundaries
const separateNodesInSector = (
  positions: Record<string, { x: number; y: number }>,
  deviceIds: string[],
  centerX: number,
  centerY: number,
  sectorStartAngle: number,
  sectorEndAngle: number,
  minRadius: number,
  maxRadius: number,
  minDistance: number,
  iterations: number = 30
): void => {
  if (deviceIds.length <= 1) return;
  
  for (let iter = 0; iter < iterations; iter++) {
    let hasOverlap = false;
    
    for (let i = 0; i < deviceIds.length; i++) {
      for (let j = i + 1; j < deviceIds.length; j++) {
        const id1 = deviceIds[i];
        const id2 = deviceIds[j];
        const p1 = positions[id1];
        const p2 = positions[id2];
        if (!p1 || !p2) continue;
        
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < minDistance && dist > 0.1) {
          hasOverlap = true;
          const overlap = (minDistance - dist) / 2 + 2;
          const nx = dx / dist;
          const ny = dy / dist;
          
          // Move nodes apart
          let newP1x = p1.x - nx * overlap;
          let newP1y = p1.y - ny * overlap;
          let newP2x = p2.x + nx * overlap;
          let newP2y = p2.y + ny * overlap;
          
          // Clamp to sector boundaries
          const clampToSector = (x: number, y: number) => {
            let angle = Math.atan2(y - centerY, x - centerX);
            let radius = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);
            
            // Normalize angles
            while (angle < sectorStartAngle) angle += Math.PI * 2;
            while (angle > sectorStartAngle + Math.PI * 2) angle -= Math.PI * 2;
            
            // Clamp angle to sector
            const sectorMid = (sectorStartAngle + sectorEndAngle) / 2;
            const sectorHalf = (sectorEndAngle - sectorStartAngle) / 2 * 0.92;
            if (angle < sectorMid - sectorHalf) angle = sectorMid - sectorHalf;
            if (angle > sectorMid + sectorHalf) angle = sectorMid + sectorHalf;
            
            // Clamp radius
            radius = Math.max(minRadius, Math.min(maxRadius, radius));
            
            return {
              x: centerX + radius * Math.cos(angle),
              y: centerY + radius * Math.sin(angle),
            };
          };
          
          const clamped1 = clampToSector(newP1x, newP1y);
          const clamped2 = clampToSector(newP2x, newP2y);
          
          positions[id1] = clamped1;
          positions[id2] = clamped2;
        }
      }
    }
    
    if (!hasOverlap) break;
  }
};

export default function NetworkTopology({ data, deviceStatuses }: NetworkTopologyProps) {
  const t = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const animationRef = useRef<number>(0);
  const particlesRef = useRef<Array<{ x: number; y: number; vx: number; vy: number; life: number }>>([]);
  const timeRef = useRef(0);
  const [zoom, setZoom] = useState(1.3); // Default zoom level (equivalent to 2 clicks of zoom in)
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  
  const [hideOfflineDevices, setHideOfflineDevices] = useState(false);
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());

  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  const [nodePositions, setNodePositions] = useState<Record<string, { x: number; y: number }>>({});

  // Transform incoming data to internal format
  const topologyData = useMemo<TopologyData | null>(() => {
    if (!data || !data.users || !data.devices) {
      return null;
    }

    // Filter devices based on hideOfflineDevices
    const filteredDevices = hideOfflineDevices 
      ? data.devices.filter(d => deviceStatuses?.get(String(d.id))?.online ?? d.online)
      : data.devices;

    const users: User[] = data.users.map(u => {
      const userDevices = filteredDevices.filter(d => d.user === u.name);
      return {
        id: String(u.id),
        name: u.name,
        online: userDevices.some(d => deviceStatuses?.get(String(d.id))?.online ?? d.online),
        deviceCount: userDevices.length,
      };
    }).filter(u => u.deviceCount > 0 || !hideOfflineDevices);

    const devices: Device[] = filteredDevices.map(d => {
      const matchingUser = data.users.find(u => u.name === d.user);
      const userId = matchingUser ? String(matchingUser.id) : d.user;
      
      return {
        id: String(d.id),
        name: d.name,
        type: inferDeviceType(d.name),
        ip: d.ipAddresses?.[0] || 'N/A',
        online: deviceStatuses?.get(String(d.id))?.online ?? d.online,
        userId,
        userName: d.user,
        lastSeen: d.lastSeen,
      };
    });

    return {
      server: { id: 'server', name: 'Headscale Cloud' },
      users,
      devices,
      acl: data.acl || [],
      policy: data.policy,
    };
  }, [data, deviceStatuses, hideOfflineDevices]);

  // Get devices to display for a user (show all devices)
  const getVisibleDevicesForUser = useCallback((userId: string, allDevices: Device[]): { visible: Device[]; hidden: number; hasMore: boolean } => {
    const userDevices = allDevices.filter(d => d.userId === userId);
    // Always show all devices
    return { visible: userDevices, hidden: 0, hasMore: false };
  }, []);

  // Visible devices for layout (respecting expansion)
  const visibleDevices = useMemo(() => {
    if (!topologyData) return [];
    const result: Device[] = [];
    
    topologyData.users.forEach(user => {
      const { visible } = getVisibleDevicesForUser(user.id, topologyData.devices);
      result.push(...visible);
    });
    
    return result;
  }, [topologyData, getVisibleDevicesForUser]);

  const hiddenDeviceCounts = useMemo(() => {
    if (!topologyData) return new Map<string, number>();
    const counts = new Map<string, number>();
    
    topologyData.users.forEach(user => {
      const { hidden, hasMore } = getVisibleDevicesForUser(user.id, topologyData.devices);
      if (hasMore) {
        counts.set(user.id, hidden);
      }
    });
    
    return counts;
  }, [topologyData, getVisibleDevicesForUser]);

  const toggleUserExpansion = useCallback((userId: string) => {
    setExpandedUsers(prev => {
      const newSet = new Set(prev);
      if (newSet.has(userId)) {
        newSet.delete(userId);
      } else {
        newSet.add(userId);
      }
      return newSet;
    });
  }, []);

  // Calculate virtual canvas size based on device count
  const getVirtualCanvasSize = useCallback((width: number, height: number) => {
    // Use actual container size directly for better layout control
    return {
      width: width,
      height: height,
    };
  }, []);

  // Calculate dynamic container height based on device count and user count
  const dynamicContainerHeight = useMemo(() => {
    const deviceCount = topologyData?.devices.length || 0;
    const userCount = topologyData?.users.length || 0;
    
    // Calculate max devices per user
    const devicesByUser: Record<string, number> = {};
    topologyData?.devices.forEach(d => {
      devicesByUser[d.userId] = (devicesByUser[d.userId] || 0) + 1;
    });
    const maxDevicesPerUser = Math.max(...Object.values(devicesByUser), 1);
    
    const deviceRingBaseRadius = 55;
    const deviceRingSpacing = 45;
    const deviceSpacingOnRing = 48;
    
    // Calculate rings needed for the user with most devices
    const calculateDevicesPerRing = (ringRadius: number) => {
      const circumference = 2 * Math.PI * ringRadius;
      return Math.max(3, Math.floor(circumference / deviceSpacingOnRing));
    };
    
    let remaining = maxDevicesPerUser;
    let ringNum = 0;
    while (remaining > 0) {
      const ringRadius = deviceRingBaseRadius + ringNum * deviceRingSpacing;
      remaining -= calculateDevicesPerRing(ringRadius);
      ringNum++;
    }
    const maxOuterRadius = deviceRingBaseRadius + Math.max(0, ringNum - 1) * deviceRingSpacing + 20;
    
    // Simple height calculation based on total content
    // Base: need space for server + users around it + device rings
    const baseHeight = 450;
    const heightPerUser = 50; // Each user adds some height
    const heightForDevices = maxOuterRadius * 2.2; // Diameter of largest device ring with margin
    
    const calculatedHeight = baseHeight + userCount * heightPerUser + heightForDevices;
    
    // Bounds: min 450px, max 1200px (raised for better canvas fill)
    return Math.min(Math.max(calculatedHeight, 450), 1200);
  }, [topologyData]);

  // User colors for visual grouping in circular layout
  const userColors = useMemo(() => {
    const colors = [
      { bg: 'from-blue-400 to-blue-600', border: 'border-blue-300 dark:border-blue-600', light: 'bg-blue-100 dark:bg-blue-900', text: 'text-blue-600 dark:text-blue-400' },
      { bg: 'from-emerald-400 to-emerald-600', border: 'border-emerald-300 dark:border-emerald-600', light: 'bg-emerald-100 dark:bg-emerald-900', text: 'text-emerald-600 dark:text-emerald-400' },
      { bg: 'from-violet-400 to-violet-600', border: 'border-violet-300 dark:border-violet-600', light: 'bg-violet-100 dark:bg-violet-900', text: 'text-violet-600 dark:text-violet-400' },
      { bg: 'from-amber-400 to-amber-600', border: 'border-amber-300 dark:border-amber-600', light: 'bg-amber-100 dark:bg-amber-900', text: 'text-amber-600 dark:text-amber-400' },
      { bg: 'from-rose-400 to-rose-600', border: 'border-rose-300 dark:border-rose-600', light: 'bg-rose-100 dark:bg-rose-900', text: 'text-rose-600 dark:text-rose-400' },
      { bg: 'from-cyan-400 to-cyan-600', border: 'border-cyan-300 dark:border-cyan-600', light: 'bg-cyan-100 dark:bg-cyan-900', text: 'text-cyan-600 dark:text-cyan-400' },
      { bg: 'from-fuchsia-400 to-fuchsia-600', border: 'border-fuchsia-300 dark:border-fuchsia-600', light: 'bg-fuchsia-100 dark:bg-fuchsia-900', text: 'text-fuchsia-600 dark:text-fuchsia-400' },
      { bg: 'from-lime-400 to-lime-600', border: 'border-lime-300 dark:border-lime-600', light: 'bg-lime-100 dark:bg-lime-900', text: 'text-lime-600 dark:text-lime-400' },
    ];
    const colorMap: Record<string, typeof colors[0]> = {};
    topologyData?.users.forEach((user, index) => {
      colorMap[user.id] = colors[index % colors.length];
    });
    return colorMap;
  }, [topologyData?.users]);

  // Radial layout algorithm - users extend outward with device rings around each user
  // Dynamically allocate angle space based on device count
  const calculateLayout = useCallback((width: number, height: number) => {
    if (!topologyData) return {};

    const vWidth = width;
    const vHeight = height;
    
    const centerX = vWidth / 2;
    const centerY = vHeight / 2;
    const positions: Record<string, { x: number; y: number }> = {};

    positions['server'] = { x: centerX, y: centerY };

    const totalUsers = topologyData.users.length;
    if (totalUsers === 0) return positions;

    const devicesByUser: Record<string, Device[]> = {};
    visibleDevices.forEach(device => {
      const userId = device.userId;
      if (!devicesByUser[userId]) {
        devicesByUser[userId] = [];
      }
      devicesByUser[userId].push(device);
    });

    // ========== Dynamic Scaling: fill canvas proportionally ==========
    // Base ring parameters (reference values at scale 1.0)
    const BASE_RING_RADIUS = 55;
    const BASE_RING_SPACING = 45;
    const BASE_DEVICE_SPACING = 48;
    const BASE_USER_PADDING = 20;
    const BASE_MIN_NODE_DIST = 45;

    const calcDevPerRing = (ringRadius: number, spacing: number) => {
      const circumference = 2 * Math.PI * ringRadius;
      return Math.max(3, Math.floor(circumference / spacing));
    };

    // Calculate outer radii at base scale (scale 1.0)
    const baseOuterRadii: Record<string, number> = {};
    topologyData.users.forEach(user => {
      const deviceCount = (devicesByUser[user.id] || []).length;
      if (deviceCount === 0) { baseOuterRadii[user.id] = 40; return; }
      let remaining = deviceCount;
      let ringNum = 0;
      while (remaining > 0) {
        const rr = BASE_RING_RADIUS + ringNum * BASE_RING_SPACING;
        remaining -= calcDevPerRing(rr, BASE_DEVICE_SPACING);
        ringNum++;
      }
      baseOuterRadii[user.id] = BASE_RING_RADIUS + Math.max(0, ringNum - 1) * BASE_RING_SPACING + BASE_USER_PADDING;
    });

    const maxBaseOuterR = Math.max(...Object.values(baseOuterRadii));
    const baseUserDist = Math.max(130, maxBaseOuterR + 50);
    const baseTotalRadius = baseUserDist + maxBaseOuterR;

    // Compute scale factor to fill the canvas
    const canvasMargin = 50;
    const availHalfW = vWidth / 2 - canvasMargin;
    const availHalfH = vHeight / 2 - canvasMargin;
    const availRadius = Math.min(availHalfW, availHalfH);
    const fillTarget = 0.85;
    const rawScale = (availRadius * fillTarget) / Math.max(baseTotalRadius, 0.8);
    const scaleFactor = Math.max(0.6, Math.min(2.5, rawScale));

    // Apply scale to ring parameters
    const deviceRingBaseRadius = BASE_RING_RADIUS * scaleFactor;
    const deviceRingSpacing = BASE_RING_SPACING * scaleFactor;
    const deviceSpacingOnRing = BASE_DEVICE_SPACING * scaleFactor;
    const userPadding = BASE_USER_PADDING * scaleFactor;

    const calculateDevicesPerRing = (ringRadius: number) => {
      const circumference = 2 * Math.PI * ringRadius;
      return Math.max(3, Math.floor(circumference / deviceSpacingOnRing));
    };

    // Recalculate outer radii with scaled parameters
    const userOuterRadius: Record<string, number> = {};
    topologyData.users.forEach(user => {
      const deviceCount = (devicesByUser[user.id] || []).length;
      if (deviceCount === 0) { userOuterRadius[user.id] = 40 * scaleFactor; return; }
      let remaining = deviceCount;
      let ringNum = 0;
      while (remaining > 0) {
        const rr = deviceRingBaseRadius + ringNum * deviceRingSpacing;
        remaining -= calculateDevicesPerRing(rr);
        ringNum++;
      }
      userOuterRadius[user.id] = deviceRingBaseRadius + Math.max(0, ringNum - 1) * deviceRingSpacing + userPadding;
    });

    // Sort users by device count descending for better visual arrangement
    const sortedUsers = [...topologyData.users].sort((a, b) => {
      const countDiff = b.deviceCount - a.deviceCount;
      if (countDiff !== 0) return countDiff;
      return a.name.localeCompare(b.name);
    });

    // Scaled user distance from center
    const maxRadius = Math.max(...Object.values(userOuterRadius));
    const baseUserDistance = baseUserDist * scaleFactor;

    // Elliptical distribution: spread users to fill non-square canvases
    const ellipseScaleX = availHalfW / Math.max(availRadius, 1);
    const ellipseScaleY = availHalfH / Math.max(availRadius, 1);
    
    // Calculate angle span needed for each user based on their outer radius
    // The angle needed is: 2 * arcsin(outerRadius / baseUserDistance)
    const userAngleSpans: Record<string, number> = {};
    let totalAngleNeeded = 0;
    
    sortedUsers.forEach(user => {
      const radius = userOuterRadius[user.id];
      // Minimum angle to avoid overlap: need enough arc length for this user's devices
      // Arc length = angle * baseUserDistance >= 2 * outerRadius
      const minAngle = (2 * radius) / baseUserDistance;
      userAngleSpans[user.id] = minAngle;
      totalAngleNeeded += minAngle;
    });
    
    // If total angle needed exceeds 2*PI, we need to increase base distance
    let finalUserDistance = baseUserDistance;
    if (totalAngleNeeded > 2 * Math.PI * 0.95) {
      // Scale up the distance to fit everyone
      finalUserDistance = baseUserDistance * (totalAngleNeeded / (2 * Math.PI * 0.9));
      // Recalculate angles with new distance
      totalAngleNeeded = 0;
      sortedUsers.forEach(user => {
        const radius = userOuterRadius[user.id];
        const minAngle = (2 * radius) / finalUserDistance;
        userAngleSpans[user.id] = minAngle;
        totalAngleNeeded += minAngle;
      });
    }
    
    // Add small gaps between users - more compact
    const gapAngle = Math.max(0.03, (2 * Math.PI - totalAngleNeeded) / totalUsers);
    
    // Position users with variable angles
    const startAngle = -Math.PI / 2; // Start from top
    let currentAngle = startAngle;
    
    sortedUsers.forEach((user) => {
      const userDevices = devicesByUser[user.id] || [];
      const deviceCount = userDevices.length;
      const angleSpan = userAngleSpans[user.id];
      
      // Place user at the center of their angle span
      const userAngle = currentAngle + angleSpan / 2;
      
      // Position user with elliptical distribution to fill canvas
      const userX = centerX + finalUserDistance * Math.cos(userAngle) * ellipseScaleX;
      const userY = centerY + finalUserDistance * Math.sin(userAngle) * ellipseScaleY;
      positions[`user_${user.id}`] = { x: userX, y: userY };
      
      // Move to next user's position
      currentAngle += angleSpan + gapAngle;
      
      if (deviceCount === 0) return;
      
      // Sort devices by online status (online first) then by name
      userDevices.sort((a, b) => {
        if (a.online !== b.online) return a.online ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      
      // Distribute devices across rings
      let deviceIdx = 0;
      let ringNum = 0;
      
      while (deviceIdx < deviceCount) {
        const ringRadius = deviceRingBaseRadius + ringNum * deviceRingSpacing;
        const maxDevicesInRing = calculateDevicesPerRing(ringRadius);
        const devicesInThisRing = Math.min(maxDevicesInRing, deviceCount - deviceIdx);
        
        // Calculate angle step for this ring
        const ringAngleStep = (2 * Math.PI) / devicesInThisRing;
        // Offset the ring slightly based on ring number for visual variety
        const ringOffset = ringNum * 0.25;
        
        for (let i = 0; i < devicesInThisRing && deviceIdx < deviceCount; i++) {
          const device = userDevices[deviceIdx];
          const deviceAngle = ringOffset + i * ringAngleStep - Math.PI / 2; // Start from top
          
          positions[device.id] = {
            x: userX + ringRadius * Math.cos(deviceAngle),
            y: userY + ringRadius * Math.sin(deviceAngle),
          };
          
          deviceIdx++;
        }
        
        ringNum++;
      }
    });

    // Light collision detection for devices (scaled)
    const allDeviceIds = visibleDevices.map(d => d.id);
    const minNodeDistance = BASE_MIN_NODE_DIST * scaleFactor;
    
    for (let iter = 0; iter < 15; iter++) {
      let hasOverlap = false;
      
      for (let i = 0; i < allDeviceIds.length; i++) {
        for (let j = i + 1; j < allDeviceIds.length; j++) {
          const id1 = allDeviceIds[i];
          const id2 = allDeviceIds[j];
          const p1 = positions[id1];
          const p2 = positions[id2];
          if (!p1 || !p2) continue;
          
          const dx = p2.x - p1.x;
          const dy = p2.y - p1.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          
          if (dist < minNodeDistance && dist > 0.1) {
            hasOverlap = true;
            const overlap = (minNodeDistance - dist) / 2 + 1;
            const nx = dx / dist;
            const ny = dy / dist;
            
            positions[id1] = {
              x: p1.x - nx * overlap,
              y: p1.y - ny * overlap,
            };
            positions[id2] = {
              x: p2.x + nx * overlap,
              y: p2.y + ny * overlap,
            };
          }
        }
      }
      
      if (!hasOverlap) break;
    }

    return positions;
  }, [topologyData, visibleDevices]);

  // Update positions on resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      setContainerSize({ width: rect.width, height: rect.height });
      setNodePositions(calculateLayout(rect.width, rect.height));
    };

    updateSize();

    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(container);

    return () => resizeObserver.disconnect();
  }, [calculateLayout]);

  // Pan handlers - with drag threshold to distinguish from clicks
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 0) { // Left click
      setIsPanning(true);
      setIsDragging(false);
      panStartRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    }
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning) {
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      // Only start dragging if moved more than 5 pixels
      if (distance > 5) {
        setIsDragging(true);
        setPan({ x: panStartRef.current.panX + dx, y: panStartRef.current.panY + dy });
      }
    }
  }, [isPanning]);

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
    // Keep isDragging true briefly to prevent click events
    setTimeout(() => setIsDragging(false), 50);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.08 : 0.08;
    setZoom(z => Math.max(0.3, Math.min(2.5, z + delta)));
  }, []);

  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  // Build ACL lookup - backend now provides pre-computed device-to-device access
  const aclLookup = useMemo(() => {
    if (!topologyData) return new Map<string, Set<string>>();
    
    // Build a map: srcDeviceId -> Set of allowed dstDeviceIds
    const allowed = new Map<string, Set<string>>();
    
    topologyData.acl.forEach(rule => {
      if (rule.action === 'accept') {
        if (!allowed.has(rule.src)) allowed.set(rule.src, new Set());
        allowed.get(rule.src)!.add(rule.dst);
      }
    });
    
    return allowed;
  }, [topologyData]);

  // Check ACL access - now uses pre-computed matrix from backend
  const canAccess = useCallback((srcId: string, dstId: string): boolean => {
    if (srcId === dstId) return true;
    
    // Check if there's an explicit allow rule from backend
    if (aclLookup.get(srcId)?.has(dstId)) return true;
    
    // Fallback: same user devices can communicate
    const srcDevice = topologyData?.devices.find(d => d.id === srcId);
    const dstDevice = topologyData?.devices.find(d => d.id === dstId);
    if (srcDevice && dstDevice && srcDevice.userId === dstDevice.userId) {
      return true;
    }
    
    return false;
  }, [aclLookup, topologyData]);

  // Get virtual canvas offset for centering
  const getCanvasOffset = useCallback(() => {
    const virtualSize = getVirtualCanvasSize(containerSize.width, containerSize.height);
    return {
      x: (containerSize.width - virtualSize.width) / 2,
      y: (containerSize.height - virtualSize.height) / 2,
    };
  }, [containerSize, getVirtualCanvasSize]);

  // Animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !topologyData) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const updateCanvasSize = () => {
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
    };
    updateCanvasSize();

    let lastTime = 0;
    const targetFPS = 60;
    const frameInterval = 1000 / targetFPS;

    const animate = (currentTime: number) => {
      if (!ctx || !canvas) return;
      
      const deltaTime = currentTime - lastTime;
      
      if (deltaTime >= frameInterval) {
        lastTime = currentTime - (deltaTime % frameInterval);
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        ctx.save();
        const canvasCenterX = canvas.width / 2;
        const canvasCenterY = canvas.height / 2;
        
        // Apply pan and zoom
        ctx.translate(canvasCenterX + pan.x, canvasCenterY + pan.y);
        ctx.scale(zoom, zoom);
        ctx.translate(-canvasCenterX, -canvasCenterY);
        
        // Apply virtual canvas offset
        const offset = getCanvasOffset();
        ctx.translate(offset.x, offset.y);
        
        timeRef.current += 0.022;

        drawPerspectiveGrid(ctx, canvas.width, canvas.height, timeRef.current);
        drawConnections(ctx, timeRef.current);
        updateAndDrawParticles(ctx);
        
        ctx.restore();
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationRef.current);
    };
  }, [nodePositions, hoveredNode, containerSize, topologyData, zoom, pan, getCanvasOffset, isDark]);

  const drawPerspectiveGrid = (ctx: CanvasRenderingContext2D, width: number, height: number, time: number) => {
    const virtualSize = getVirtualCanvasSize(width, height);
    const centerX = virtualSize.width / 2;
    const centerY = virtualSize.height / 2;
    const maxDim = Math.max(virtualSize.width, virtualSize.height);

    const gridColor = isDark ? '96, 165, 250' : '59, 130, 246';

    ctx.lineWidth = 1;
    for (let i = 0; i < 16; i++) {
      const angle = (i / 16) * Math.PI * 2 + time * 0.012;
      const alpha = (isDark ? 0.06 : 0.03) + Math.sin(time + i) * 0.008;
      ctx.strokeStyle = `rgba(${gridColor}, ${alpha})`;
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(centerX + Math.cos(angle) * maxDim, centerY + Math.sin(angle) * maxDim);
      ctx.stroke();
    }

    for (let i = 1; i <= 6; i++) {
      const baseRadius = (Math.min(virtualSize.width, virtualSize.height) / 2) * (i / 5);
      const pulseOffset = Math.sin(time * 1.2 + i * 0.5) * 3;
      const alpha = (isDark ? 0.05 : 0.02) + Math.sin(time * 1.0 + i) * 0.008;

      ctx.beginPath();
      ctx.arc(centerX, centerY, baseRadius + pulseOffset, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${gridColor}, ${alpha})`;
      ctx.stroke();
    }
  };

  const drawConnections = (ctx: CanvasRenderingContext2D, time: number) => {
    if (!topologyData) return;
    
    const serverPos = nodePositions['server'];
    if (!serverPos) return;

    // Check if hovering over a device node (not user or server)
    const hoveredDevice = visibleDevices.find(d => d.id === hoveredNode);
    const accessPathNodes = hoveredDevice ? getAccessibleDevicesWithPaths(hoveredDevice.id).pathNodes : null;
    const accessibleIds = hoveredDevice ? getAccessibleDevicesWithPaths(hoveredDevice.id).accessibleIds : null;

    // Server to users - straight lines for circular layout
    topologyData.users.forEach((user) => {
      const userPos = nodePositions[`user_${user.id}`];
      if (!userPos) return;

      // Check if this user is in the access path
      const isInPath = accessPathNodes?.has(user.id);
      const isDimmed = hoveredDevice && !isInPath;
      const isHighlighted = hoveredDevice && isInPath;

      // Use minimal curvature for cleaner circular layout
      const curvature = 0;
      
      if (isHighlighted) {
        // Draw highlighted path (green glow)
        drawHighlightedLine(ctx, serverPos.x, serverPos.y, userPos.x, userPos.y, time, curvature);
      } else {
        const opacity = isDimmed ? 0.15 : 1;
        drawAnimatedCurvedLine(
          ctx, serverPos.x, serverPos.y, userPos.x, userPos.y,
          user.online ? `rgba(${isDark ? '96, 165, 250' : '59, 130, 246'}, ${(isDark ? 0.65 : 0.5) * opacity})` : `rgba(148, 163, 184, ${(isDark ? 0.5 : 0.4) * opacity})`,
          user.online && !isDimmed, time, user.online ? 1.8 : 1.3, curvature
        );
      }
    });

    // Users to devices - straight lines for circular layout
    visibleDevices.forEach((device) => {
      const devicePos = nodePositions[device.id];
      const userPos = nodePositions[`user_${device.userId}`];
      if (!devicePos || !userPos) return;

      // Check if this device is in the access path
      const isSource = hoveredDevice?.id === device.id;
      const isAccessible = accessibleIds?.has(device.id);
      const isInPath = isSource || isAccessible;
      const isDimmed = hoveredDevice && !isInPath;
      const isHighlighted = hoveredDevice && isInPath;

      // Use minimal curvature for cleaner circular layout
      const curvature = 0;
      
      if (isHighlighted) {
        // Draw highlighted path (green glow)
        drawHighlightedLine(ctx, userPos.x, userPos.y, devicePos.x, devicePos.y, time, curvature);
      } else {
        const opacity = isDimmed ? 0.15 : 1;
        drawAnimatedCurvedLine(
          ctx, userPos.x, userPos.y, devicePos.x, devicePos.y,
          device.online ? `rgba(${isDark ? '129, 195, 255' : '96, 165, 250'}, ${(isDark ? 0.55 : 0.45) * opacity})` : `rgba(148, 163, 184, ${(isDark ? 0.45 : 0.35) * opacity})`,
          device.online && !isDimmed, time, device.online ? 1.3 : 1, curvature
        );
      }
    });
  };

  // Draw highlighted line for ACL paths
  const drawHighlightedLine = (
    ctx: CanvasRenderingContext2D,
    x1: number, y1: number, x2: number, y2: number,
    time: number, curvature: number = 0
  ) => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance === 0) return;
    
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    const perpX = -dy / distance;
    const perpY = dx / distance;
    const offset = distance * curvature;
    const ctrlX = midX + perpX * offset;
    const ctrlY = midY + perpY * offset;

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.quadraticCurveTo(ctrlX, ctrlY, x2, y2);
    ctx.strokeStyle = 'rgba(34, 197, 94, 0.15)';
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.quadraticCurveTo(ctrlX, ctrlY, x2, y2);
    ctx.strokeStyle = 'rgba(34, 197, 94, 0.7)';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    for (let i = 0; i < 2; i++) {
      const t = ((time * 0.3 + i * 0.5) % 1);
      const px = (1 - t) * (1 - t) * x1 + 2 * (1 - t) * t * ctrlX + t * t * x2;
      const py = (1 - t) * (1 - t) * y1 + 2 * (1 - t) * t * ctrlY + t * t * y2;
      
      const gradient = ctx.createRadialGradient(px, py, 0, px, py, 6);
      gradient.addColorStop(0, 'rgba(34, 197, 94, 0.9)');
      gradient.addColorStop(0.5, 'rgba(34, 197, 94, 0.4)');
      gradient.addColorStop(1, 'rgba(34, 197, 94, 0)');
      
      ctx.beginPath();
      ctx.arc(px, py, 6, 0, Math.PI * 2);
      ctx.fillStyle = gradient;
      ctx.fill();
    }
  };

  // Animated curved line
  const drawAnimatedCurvedLine = (
    ctx: CanvasRenderingContext2D,
    x1: number, y1: number, x2: number, y2: number,
    color: string, isOnline: boolean, time: number,
    lineWidth: number = 1.5, curvature: number = 0.15
  ) => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance === 0) return;
    
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    const perpX = -dy / distance;
    const perpY = dx / distance;
    const offset = distance * curvature;
    const ctrlX = midX + perpX * offset;
    const ctrlY = midY + perpY * offset;

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.quadraticCurveTo(ctrlX, ctrlY, x2, y2);
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    
    if (!isOnline) {
      ctx.setLineDash([5, 4]);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    if (isOnline) {
      for (let i = 0; i < 2; i++) {
        const t = ((time * 0.28 + i * 0.5) % 1);
        const px = (1 - t) * (1 - t) * x1 + 2 * (1 - t) * t * ctrlX + t * t * x2;
        const py = (1 - t) * (1 - t) * y1 + 2 * (1 - t) * t * ctrlY + t * t * y2;
        
        const gradient = ctx.createRadialGradient(px, py, 0, px, py, 4);
        gradient.addColorStop(0, isDark ? 'rgba(96, 165, 250, 0.9)' : 'rgba(59, 130, 246, 0.8)');
        gradient.addColorStop(1, isDark ? 'rgba(96, 165, 250, 0)' : 'rgba(59, 130, 246, 0)');
        
        ctx.beginPath();
        ctx.arc(px, py, 4, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();
      }
    }
  };

  // Get ACL for device
  const getDeviceACL = useCallback((deviceId: string): { allowed: string[]; denied: string[] } => {
    if (!topologyData) return { allowed: [], denied: [] };
    
    const allowed: string[] = [];
    const denied: string[] = [];
    
    topologyData.devices.forEach(d => {
      if (d.id === deviceId) return;
      if (canAccess(deviceId, d.id)) {
        allowed.push(d.id);
      } else {
        denied.push(d.id);
      }
    });
    
    return { allowed, denied };
  }, [topologyData, canAccess]);

  // Get accessible devices and their paths
  const getAccessibleDevicesWithPaths = useCallback((deviceId: string): { 
    accessibleIds: Set<string>;
    pathNodes: Set<string>; // Users that are part of access paths
  } => {
    if (!topologyData) return { accessibleIds: new Set(), pathNodes: new Set() };
    
    const srcDevice = topologyData.devices.find(d => d.id === deviceId);
    if (!srcDevice) return { accessibleIds: new Set(), pathNodes: new Set() };
    
    const accessibleIds = new Set<string>();
    const pathNodes = new Set<string>();
    
    // Always include source user
    pathNodes.add(srcDevice.userId);
    pathNodes.add('server');
    
    topologyData.devices.forEach(d => {
      if (d.id === deviceId) return;
      if (canAccess(deviceId, d.id)) {
        accessibleIds.add(d.id);
        pathNodes.add(d.userId);
      }
    });
    
    return { accessibleIds, pathNodes };
  }, [topologyData, canAccess]);

  const updateAndDrawParticles = (ctx: CanvasRenderingContext2D) => {
    if (Math.random() < 0.04) {
      const serverPos = nodePositions['server'];
      if (serverPos) {
        particlesRef.current.push({
          x: serverPos.x + (Math.random() - 0.5) * 30,
          y: serverPos.y + (Math.random() - 0.5) * 30,
          vx: (Math.random() - 0.5) * 1,
          vy: (Math.random() - 0.5) * 1,
          life: 1,
        });
      }
    }

    if (particlesRef.current.length > 25) {
      particlesRef.current = particlesRef.current.slice(-25);
    }

    particlesRef.current = particlesRef.current.filter((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 0.015;

      if (p.life > 0) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
        ctx.fillStyle = isDark ? `rgba(96, 165, 250, ${p.life * 0.5})` : `rgba(59, 130, 246, ${p.life * 0.4})`;
        ctx.fill();
        return true;
      }
      return false;
    });
  };

  const handleDeviceClick = (device: Device, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Don't trigger click if we were dragging
    if (isDragging || isPanning) return;
    setSelectedDevice(prev => prev?.id === device.id ? null : device);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success(t.topology.copiedToClipboard);
  };

  const DeviceIcon = ({ type, online, size = 20 }: { type: string; online: boolean; size?: number }) => {
    const iconClass = `${online ? 'text-blue-500' : 'text-gray-400'}`;
    
    switch (type) {
      case 'laptop': return <Laptop size={size} className={iconClass} strokeWidth={1.5} />;
      case 'phone': return <Smartphone size={size} className={iconClass} strokeWidth={1.5} />;
      case 'desktop': return <Monitor size={size} className={iconClass} strokeWidth={1.5} />;
      case 'tablet': return <Tablet size={size} className={iconClass} strokeWidth={1.5} />;
      case 'server': return <Server size={size} className={iconClass} strokeWidth={1.5} />;
      default: return <Monitor size={size} className={iconClass} strokeWidth={1.5} />;
    }
  };

  const getNodeSize = () => {
    const totalDevices = topologyData?.devices.length || 0;
    if (totalDevices > 30) return { device: 32, user: 22, icon: 13 };
    if (totalDevices > 25) return { device: 34, user: 23, icon: 14 };
    if (totalDevices > 20) return { device: 36, user: 24, icon: 15 };
    if (totalDevices > 15) return { device: 40, user: 26, icon: 17 };
    return { device: 44, user: 28, icon: 18 };
  };

  const nodeSize = getNodeSize();

  // Get virtual canvas size for positioning
  const virtualCanvasSize = useMemo(() => {
    return getVirtualCanvasSize(containerSize.width, containerSize.height);
  }, [containerSize, getVirtualCanvasSize]);

  // Calculate canvas offset for HTML elements
  const canvasOffset = useMemo(() => {
    return getCanvasOffset();
  }, [getCanvasOffset]);

  const getACLSortedDevices = useCallback(() => {
    if (!selectedDevice || !topologyData) return {};
    
    const otherDevices = topologyData.devices.filter(d => d.id !== selectedDevice.id);
    const devicesByUser: Record<string, Array<{ device: Device; canAccessTo: boolean }>> = {};
    
    otherDevices.forEach(device => {
      const canAccessTo = canAccess(selectedDevice.id, device.id);
      const userName = device.userName || device.userId;
      if (!devicesByUser[userName]) devicesByUser[userName] = [];
      devicesByUser[userName].push({ device, canAccessTo });
    });
    
    Object.keys(devicesByUser).forEach(user => {
      devicesByUser[user].sort((a, b) => (a.canAccessTo === b.canAccessTo ? 0 : a.canAccessTo ? -1 : 1));
    });
    
    return devicesByUser;
  }, [selectedDevice, topologyData, canAccess]);

  if (!topologyData) {
    return (
      <Card className="relative overflow-hidden bg-gradient-to-br from-slate-50 via-blue-50/20 to-slate-50 dark:from-slate-900 dark:via-blue-950/20 dark:to-slate-900">
        <div ref={containerRef} className="relative w-full flex items-center justify-center" style={{ height: '500px' }}>
          <div className="text-center text-muted-foreground">
            <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium">{t.topology.noData}</p>
            <p className="text-sm">{t.topology.waitForData}</p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="relative overflow-hidden bg-gradient-to-br from-slate-50 via-blue-50/20 to-slate-50 dark:from-slate-900 dark:via-blue-950/20 dark:to-slate-900">
      {/* Controls */}
      <div className="absolute top-3 left-3 z-30 flex gap-1">
        <Button variant="outline" size="icon" className="h-7 w-7 bg-white/90 hover:bg-white dark:bg-slate-800/90 dark:hover:bg-slate-800" onClick={() => setZoom(z => Math.min(z + 0.15, 2.5))}>
          <ZoomIn className="h-3.5 w-3.5" />
        </Button>
        <Button variant="outline" size="icon" className="h-7 w-7 bg-white/90 hover:bg-white dark:bg-slate-800/90 dark:hover:bg-slate-800" onClick={() => setZoom(z => Math.max(z - 0.15, 0.3))}>
          <ZoomOut className="h-3.5 w-3.5" />
        </Button>
        <Button variant="outline" size="icon" className="h-7 w-7 bg-white/90 hover:bg-white dark:bg-slate-800/90 dark:hover:bg-slate-800" onClick={resetView}>
          <Maximize2 className="h-3.5 w-3.5" />
        </Button>
        <div className="h-7 w-px bg-gray-200 dark:bg-gray-700 mx-1" />
        <Button
          variant={hideOfflineDevices ? "default" : "outline"}
          size="sm"
          className={`h-7 px-2 text-xs gap-1 ${hideOfflineDevices ? 'bg-primary' : 'bg-white/90 hover:bg-white dark:bg-slate-800/90 dark:hover:bg-slate-800'}`}
          onClick={() => setHideOfflineDevices(!hideOfflineDevices)}
        >
          {hideOfflineDevices ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
          <span className="hidden sm:inline">{hideOfflineDevices ? t.topology.showOffline : t.topology.hideOffline}</span>
        </Button>
      </div>

      <div 
        ref={containerRef} 
        className={`relative w-full select-none ${isPanning ? 'cursor-grabbing' : 'cursor-grab'}`}
        style={{ height: `${dynamicContainerHeight}px` }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" style={{ pointerEvents: 'none' }} />

        <div 
          className="absolute inset-0 transition-transform duration-75" 
          style={{ 
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: 'center center',
            pointerEvents: isDragging ? 'none' : 'auto',
          }}
        >
          {/* Offset container for virtual canvas */}
          <div style={{ transform: `translate(${canvasOffset.x}px, ${canvasOffset.y}px)` }}>
            {/* Server Node */}
            {nodePositions['server'] && (
              <div className="absolute transform -translate-x-1/2 -translate-y-1/2 z-20" style={{ left: nodePositions['server'].x, top: nodePositions['server'].y }}>
                <div className="relative group cursor-pointer">
                  <div className="absolute -inset-4 bg-gradient-to-r from-blue-400/25 via-primary/35 to-blue-400/25 blur-xl rounded-full animate-pulse" style={{ animationDuration: '2s' }} />
                  <div className="relative w-14 h-10 flex items-center justify-center">
                    <svg viewBox="0 0 120 70" className="w-full h-full drop-shadow-lg" style={{ filter: 'drop-shadow(0 3px 10px rgba(0, 102, 255, 0.35))' }}>
                      <defs>
                        <linearGradient id="cloudGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#60A5FA" />
                          <stop offset="50%" stopColor="#3B82F6" />
                          <stop offset="100%" stopColor="#1D4ED8" />
                        </linearGradient>
                        <linearGradient id="cloudHighlight" x1="0%" y1="0%" x2="0%" y2="100%">
                          <stop offset="0%" stopColor="rgba(255,255,255,0.5)" />
                          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
                        </linearGradient>
                      </defs>
                      <path d="M95 50 C115 50 115 30 95 30 C95 10 70 5 55 18 C40 5 15 10 15 30 C-5 30 -5 50 15 50 Z" fill="url(#cloudGradient)" className="transition-transform duration-500 group-hover:scale-105" style={{ transformOrigin: 'center' }} />
                      <path d="M90 45 C105 45 105 30 90 30 C90 15 70 12 58 22 C48 12 28 15 28 30 C15 30 15 45 28 45 Z" fill="url(#cloudHighlight)" />
                      <g transform="translate(45, 24)">
                        <rect x="2" y="1" width="14" height="5" rx="1" fill="rgba(255,255,255,0.95)" />
                        <rect x="2" y="9" width="14" height="5" rx="1" fill="rgba(255,255,255,0.95)" />
                        <circle cx="6" cy="3.5" r="1.2" fill="#3B82F6" />
                        <circle cx="6" cy="11.5" r="1.2" fill="#3B82F6" />
                      </g>
                    </svg>
                  </div>
                  <div className="absolute -bottom-4 left-1/2 transform -translate-x-1/2 whitespace-nowrap">
                    <span className="text-[8px] font-bold text-primary bg-white/95 dark:bg-slate-900/95 px-1.5 py-0.5 rounded-full shadow-sm border border-blue-100 dark:border-blue-800">{topologyData.server.name}</span>
                  </div>
                </div>
              </div>
            )}

            {/* User Nodes */}
            {topologyData.users.map((user) => {
              const pos = nodePositions[`user_${user.id}`];
              if (!pos) return null;
              const userColor = userColors[user.id];
              
              // Check if a device is being hovered and if this user is in its access path
              const hoveredDevice = visibleDevices.find(d => d.id === hoveredNode);
              const isInAccessPath = hoveredDevice ? getAccessibleDevicesWithPaths(hoveredDevice.id).pathNodes.has(user.id) : false;
              const shouldDim = hoveredDevice && !isInAccessPath;
              
              return (
                <div key={user.id} className="absolute transform -translate-x-1/2 -translate-y-1/2 z-10" style={{ left: pos.x, top: pos.y }}>
                  <div
                    className={`relative flex items-center gap-1 px-1.5 py-0.5 rounded-full shadow-sm transition-all duration-200 cursor-pointer
                      ${user.online ? `bg-white dark:bg-slate-800 hover:shadow-md hover:scale-105 border ${userColor?.border || 'border-blue-200 dark:border-blue-600'}` : 'bg-gray-50/90 dark:bg-gray-800/90 border border-gray-300 dark:border-gray-600'}
                      ${isInAccessPath ? 'ring-2 ring-green-500 ring-offset-1 shadow-lg shadow-green-200 dark:shadow-green-900' : ''}
                      ${shouldDim ? 'opacity-30' : ''}
                    `}
                    onMouseEnter={() => setHoveredNode(user.id)}
                    onMouseLeave={() => setHoveredNode(null)}
                  >
                    <div className="relative">
                      <div className={`rounded-full flex items-center justify-center text-white font-semibold ${user.online ? `bg-gradient-to-br ${userColor?.bg || 'from-blue-400 to-blue-600'}` : 'bg-gray-400'}`} style={{ width: nodeSize.user, height: nodeSize.user, fontSize: nodeSize.user * 0.38 }}>
                        {user.name.charAt(0).toUpperCase()}
                      </div>
                      <div className={`absolute -bottom-0.5 -right-0.5 rounded-full border-2 border-white dark:border-slate-800 ${user.online ? 'bg-green-500' : 'bg-gray-400'}`} style={{ width: 8, height: 8 }}>
                        {user.online && <span className="absolute inset-0 rounded-full bg-green-500 animate-ping opacity-60" style={{ animationDuration: '1.5s' }} />}
                      </div>
                    </div>
                    <span className={`text-[9px] font-medium ${user.online ? 'text-gray-700 dark:text-gray-200' : 'text-gray-500 dark:text-gray-400'}`}>{user.name}</span>
                    {user.deviceCount > 0 && (
                      <span className="absolute -top-1 -right-1 bg-primary text-white rounded-full flex items-center justify-center font-bold shadow text-[7px]" style={{ width: 13, height: 13 }}>{user.deviceCount}</span>
                    )}
                  </div>
                  {/* Expand/Collapse button removed - always show all devices */}
                </div>
              );
            })}

            {/* Device Nodes */}
            {visibleDevices.map((device) => {
              const pos = nodePositions[device.id];
              if (!pos) return null;
              const isSelected = selectedDevice?.id === device.id;
              const isHovered = hoveredNode === device.id;
              const deviceUserColor = userColors[device.userId];
              
              // Check if another device is being hovered
              const hoveredDevice = visibleDevices.find(d => d.id === hoveredNode);
              const isAccessible = hoveredDevice && hoveredDevice.id !== device.id 
                ? canAccess(hoveredDevice.id, device.id) 
                : false;
              const shouldDim = hoveredDevice && hoveredDevice.id !== device.id && !isAccessible;

              return (
                <div 
                  key={device.id} 
                  className={`absolute transform -translate-x-1/2 -translate-y-1/2 z-10 transition-opacity duration-200 ${shouldDim ? 'opacity-30' : ''}`} 
                  style={{ left: pos.x, top: pos.y }}
                >
                  <div
                    className={`relative cursor-pointer transition-all duration-200 ${isSelected ? 'scale-115' : isHovered ? 'scale-110' : 'hover:scale-105'}`}
                    onClick={(e) => handleDeviceClick(device, e)}
                    onMouseEnter={() => setHoveredNode(device.id)}
                    onMouseLeave={() => setHoveredNode(null)}
                  >
                    {(isSelected || isHovered || isAccessible) && (
                      <div className={`absolute inset-0 rounded-full blur-md transition-all duration-200 scale-150
                        ${isSelected ? 'bg-blue-400/40' : isHovered ? 'bg-blue-400/30' : 'bg-green-400/35'}
                      `} />
                    )}
                    <div
                      className={`relative rounded-full flex flex-col items-center justify-center shadow transition-all duration-200
                        ${device.online ? `bg-white dark:bg-slate-800 border-2 ${deviceUserColor?.border || 'border-blue-200 dark:border-blue-600'}` : 'bg-gray-100 dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-600'}
                        ${isSelected ? 'ring-2 ring-blue-500 ring-offset-2' : ''}
                        ${isHovered ? 'ring-2 ring-blue-400 ring-offset-1 shadow-lg' : ''}
                        ${isAccessible ? 'ring-2 ring-green-500 ring-offset-1' : ''}
                        ${!isSelected && !isHovered ? 'shadow-sm' : ''}
                      `}
                      style={{ width: nodeSize.device, height: nodeSize.device }}
                    >
                      <DeviceIcon type={device.type} online={device.online} size={nodeSize.icon} />
                      <div className={`absolute -top-0.5 -right-0.5 rounded-full border-2 border-white dark:border-slate-800 flex items-center justify-center ${device.online ? 'bg-green-500' : 'bg-gray-400'}`} style={{ width: 9, height: 9 }}>
                        {device.online && <Wifi className="w-1.5 h-1.5 text-white" />}
                      </div>
                      {/* User color indicator dot */}
                      {device.online && deviceUserColor && (
                        <div className={`absolute -bottom-0.5 -left-0.5 w-2.5 h-2.5 rounded-full border border-white dark:border-slate-800 ${deviceUserColor.light}`} />
                      )}
                    </div>
                    <div className="absolute -bottom-7 left-1/2 transform -translate-x-1/2 text-center whitespace-nowrap">
                      <p className={`text-[8px] font-medium leading-tight ${device.online ? (deviceUserColor?.text || 'text-gray-700 dark:text-gray-200') : 'text-gray-500 dark:text-gray-400'}`}>
                        {device.name.length > 10 ? device.name.slice(0, 10) + '...' : device.name}
                      </p>
                      <p className="text-[7px] text-muted-foreground font-mono">{device.ip}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Legend */}
        <div className="absolute bottom-2 left-2 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm rounded-lg p-2 shadow-sm border border-gray-200 dark:border-gray-700 z-30">
          <p className="text-[8px] font-semibold text-gray-600 dark:text-gray-300 mb-1">{t.topology.legend}</p>
          <div className="space-y-0.5">
            <div className="flex items-center gap-1 text-[8px]"><div className="w-2 h-2 rounded-full bg-green-500" /><span className="text-gray-600 dark:text-gray-300">{t.common.status.online}</span></div>
            <div className="flex items-center gap-1 text-[8px]"><div className="w-2 h-2 rounded-full bg-gray-400" /><span className="text-gray-600 dark:text-gray-300">{t.common.status.offline}</span></div>
            <div className="flex items-center gap-1 text-[8px]"><div className="w-4 h-0.5 bg-green-500 rounded" /><span className="text-gray-600 dark:text-gray-300">{t.topology.accessiblePath}</span></div>
          </div>
          {/* User color legend */}
          {topologyData.users.length > 0 && (
            <div className="mt-1.5 pt-1 border-t border-gray-200 dark:border-gray-700">
              <p className="text-[7px] text-gray-500 dark:text-gray-400 mb-0.5">{t.topology.userColors}</p>
              <div className="flex flex-wrap gap-1">
                {topologyData.users.slice(0, 6).map((user) => {
                  const color = userColors[user.id];
                  return (
                    <div key={user.id} className="flex items-center gap-0.5">
                      <div className={`w-2 h-2 rounded-full bg-gradient-to-br ${color?.bg || 'from-blue-400 to-blue-600'}`} />
                      <span className="text-[7px] text-gray-500 dark:text-gray-400">{user.name.slice(0, 3)}</span>
                    </div>
                  );
                })}
                {topologyData.users.length > 6 && <span className="text-[7px] text-gray-400 dark:text-gray-500">+{topologyData.users.length - 6}</span>}
              </div>
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="absolute bottom-2 right-2 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm rounded-lg px-2 py-1 shadow-sm border border-gray-200 dark:border-gray-700 z-30">
          <p className="text-[8px] text-gray-600 dark:text-gray-300 font-medium">
            {topologyData.users.length} {t.topology.usersLabel} · {visibleDevices.length}/{topologyData.devices.length} {t.topology.devicesLabel} · {visibleDevices.filter(d => d.online).length} {t.common.status.online}
            {hideOfflineDevices && <span className="text-amber-600 dark:text-amber-400 ml-1">({t.topology.onlineOnly})</span>}
          </p>
        </div>

        {/* Instructions */}
        <div className="absolute top-2 right-2 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm rounded-lg px-2 py-1 shadow-sm border border-gray-200 dark:border-gray-700 z-30">
          <p className="text-[8px] text-gray-600 dark:text-gray-300 flex items-center gap-1"><Move className="w-3 h-3" /> {t.topology.instructions}</p>
        </div>
      </div>

      {/* Device Detail Sheet */}
      <Sheet open={!!selectedDevice} onOpenChange={() => setSelectedDevice(null)}>
        <SheetContent className="p-0">
          <div className="p-6">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${selectedDevice?.online ? 'bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800' : 'bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700'}`}>
                  {selectedDevice && <DeviceIcon type={selectedDevice.type} online={selectedDevice.online} size={22} />}
                </div>
                <div>
                  <p className="text-base font-semibold">{selectedDevice?.name}</p>
                  <p className="text-sm text-muted-foreground font-mono">{selectedDevice?.ip}</p>
                </div>
              </SheetTitle>
            </SheetHeader>

            {selectedDevice && (
              <div className="mt-5 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">{t.topology.status}</span>
                  <Badge variant={selectedDevice.online ? 'default' : 'secondary'} className={selectedDevice.online ? 'bg-green-500' : ''}>{selectedDevice.online ? t.common.status.online : t.common.status.offline}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">{t.topology.belongsToUser}</span>
                  <span className="text-sm font-medium">{selectedDevice.userName || selectedDevice.userId}</span>
                </div>
                {selectedDevice.lastSeen && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">{t.topology.lastOnline}</span>
                    <span className="text-sm">{new Date(selectedDevice.lastSeen).toLocaleString('zh-CN')}</span>
                  </div>
                )}

                <Separator />

                <div>
                  <p className="text-sm font-medium mb-2 flex items-center gap-2">
                    {t.topology.aclPermissions}
                    <Badge variant="outline" className="text-[10px] font-normal">{getDeviceACL(selectedDevice.id).allowed.length} {t.topology.allow} / {getDeviceACL(selectedDevice.id).denied.length} {t.topology.deny}</Badge>
                  </p>
                  <ScrollArea className="h-[240px]">
                    <div className="space-y-3 pr-4">
                      {Object.entries(getACLSortedDevices()).map(([userName, devices]) => (
                        <div key={userName}>
                          <p className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
                            <span className="w-4 h-4 rounded-full bg-primary/10 text-primary text-[9px] flex items-center justify-center font-semibold">{userName.charAt(0).toUpperCase()}</span>
                            {userName}
                            <span className="text-[9px] text-gray-400 dark:text-gray-500">({devices.length})</span>
                          </p>
                          <div className="space-y-1 ml-2">
                            {devices.map(({ device, canAccessTo }) => (
                              <div key={device.id} className={`flex items-center justify-between p-1.5 rounded-lg transition-colors ${canAccessTo ? 'bg-green-50/50 dark:bg-green-950/50 border border-green-100 dark:border-green-800' : 'bg-red-50/50 dark:bg-red-950/50 border border-red-100 dark:border-red-800'}`}>
                                <div className="flex items-center gap-1.5">
                                  <div className={`w-6 h-6 rounded-full flex items-center justify-center ${device.online ? 'bg-white dark:bg-slate-800' : 'bg-gray-50 dark:bg-gray-800'}`}>
                                    <DeviceIcon type={device.type} online={device.online} size={13} />
                                  </div>
                                  <div>
                                    <span className="text-[10px] block font-medium">{device.name}</span>
                                    <span className="text-[9px] text-muted-foreground font-mono">{device.ip}</span>
                                  </div>
                                </div>
                                <Badge variant={canAccessTo ? 'default' : 'destructive'} className={`text-[9px] px-1 py-0 ${canAccessTo ? 'bg-green-500' : ''}`}>{canAccessTo ? t.topology.allow : t.topology.deny}</Badge>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>

                <Separator />

                <div className="space-y-1.5">
                  <p className="text-sm font-medium mb-1.5">{t.topology.quickActions}</p>
                  <Button variant="outline" size="sm" className="w-full justify-start gap-2 h-8" onClick={() => copyToClipboard(`ssh root@${selectedDevice.ip}`)}>
                    <Terminal className="w-3 h-3" /><span className="text-xs">{t.topology.copySSH}</span>
                  </Button>
                  <Button variant="outline" size="sm" className="w-full justify-start gap-2 h-8" onClick={() => copyToClipboard(selectedDevice.ip)}>
                    <Copy className="w-3 h-3" /><span className="text-xs">{t.topology.copyIP}</span>
                  </Button>
                </div>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </Card>
  );
}
