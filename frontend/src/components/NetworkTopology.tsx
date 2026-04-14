import { Button, Card, Drawer, Switch, Tag, Typography, message, theme } from 'antd';
import {
  CopyOutlined, CodeOutlined, WifiOutlined,
  ZoomInOutlined, ZoomOutOutlined, ExpandOutlined,
  ExclamationCircleOutlined, LaptopOutlined, MobileOutlined,
  DesktopOutlined, TabletOutlined, CloudServerOutlined,
  DragOutlined, EyeOutlined, EyeInvisibleOutlined,
} from '@ant-design/icons';
import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { useTranslation } from '@/i18n/index';
import { ACLAction } from '@/lib/enums';

enum DeviceType {
  Laptop = 'laptop',
  Phone = 'phone',
  Desktop = 'desktop',
  Tablet = 'tablet',
  Server = 'server',
}

const { Text } = Typography;

// User color palette for visual grouping
const USER_COLORS = [
  { gradient: 'linear-gradient(135deg, #60a5fa, #2563eb)', border: '#93c5fd' },
  { gradient: 'linear-gradient(135deg, #34d399, #059669)', border: '#6ee7b7' },
  { gradient: 'linear-gradient(135deg, #a78bfa, #7c3aed)', border: '#c4b5fd' },
  { gradient: 'linear-gradient(135deg, #fbbf24, #d97706)', border: '#fcd34d' },
  { gradient: 'linear-gradient(135deg, #fb7185, #e11d48)', border: '#fda4af' },
  { gradient: 'linear-gradient(135deg, #22d3ee, #0891b2)', border: '#67e8f9' },
  { gradient: 'linear-gradient(135deg, #e879f9, #a21caf)', border: '#f0abfc' },
  { gradient: 'linear-gradient(135deg, #a3e635, #65a30d)', border: '#bef264' },
];

interface Device {
  id: string;
  name: string;
  type: DeviceType;
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
  action: ACLAction;
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
      action: ACLAction;
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
    return DeviceType.Phone;
  }
  if (lowerName.includes('ipad') || lowerName.includes('tablet') || lowerName.includes('surface') || lowerName.includes('pad')) {
    return DeviceType.Tablet;
  }
  if (lowerName.includes('macbook') || lowerName.includes('laptop') || lowerName.includes('thinkpad') || lowerName.includes('thinkbook') || lowerName.includes('notebook') || lowerName.includes('mba')) {
    return DeviceType.Laptop;
  }
  if (lowerName.includes('server') || lowerName.includes('nas') || lowerName.includes('raspberry') || lowerName.includes('pi') || lowerName.includes('vault') || lowerName.includes('kvm') || lowerName.includes('openwrt') || lowerName.includes('cloud') || lowerName.includes('dev')) {
    return DeviceType.Server;
  }
  return DeviceType.Desktop;
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
      if (rule.action === ACLAction.Accept) {
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
    message.success(t.topology.copiedToClipboard);
  };

  const DeviceIcon = ({ type, online, size = 20 }: { type: string; online: boolean; size?: number }) => {
    const style = { fontSize: size, color: online ? '#1677ff' : '#999' };
    switch (type) {
      case 'laptop': return <LaptopOutlined style={style} />;
      case 'phone': return <MobileOutlined style={style} />;
      case 'desktop': return <DesktopOutlined style={style} />;
      case 'tablet': return <TabletOutlined style={style} />;
      case 'server': return <CloudServerOutlined style={style} />;
      default: return <DesktopOutlined style={style} />;
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

  const { token } = theme.useToken();

  if (!topologyData) {
    return (
      <Card className="relative overflow-hidden">
        <div ref={containerRef} className="relative w-full flex items-center justify-center h-500px">
          <div style={{ textAlign: 'center', color: token.colorTextSecondary }}>
            <ExclamationCircleOutlined className="text-48px opacity-50 block mx-auto mb-4" />
            <p className="text-18px font-500">{t.topology.noData}</p>
            <p className="text-14px">{t.topology.waitForData}</p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="relative overflow-hidden" styles={{ body: { padding: 0 } }}>
      {/* Controls */}
      <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 30, display: 'flex', gap: 4 }}>
        <Button size="small" icon={<ZoomInOutlined />} onClick={() => setZoom(z => Math.min(z + 0.15, 2.5))} />
        <Button size="small" icon={<ZoomOutOutlined />} onClick={() => setZoom(z => Math.max(z - 0.15, 0.3))} />
        <Button size="small" icon={<ExpandOutlined />} onClick={resetView} />
        <div style={{ width: 1, height: 28, background: token.colorBorderSecondary, margin: '0 4px' }} />
        <Button
          size="small"
          type={hideOfflineDevices ? 'primary' : 'default'}
          icon={hideOfflineDevices ? <EyeInvisibleOutlined /> : <EyeOutlined />}
          onClick={() => setHideOfflineDevices(!hideOfflineDevices)}
        >
          {hideOfflineDevices ? t.topology.showOffline : t.topology.hideOffline}
        </Button>
      </div>

      <div
        ref={containerRef}
        style={{ position: 'relative', width: '100%', userSelect: 'none', cursor: isPanning ? 'grabbing' : 'grab', height: dynamicContainerHeight }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />

        <div
          style={{
            position: 'absolute', inset: 0,
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: 'center center',
            pointerEvents: isDragging ? 'none' : 'auto',
          }}
        >
          <div style={{ transform: `translate(${canvasOffset.x}px, ${canvasOffset.y}px)` }}>
            {/* Server Node */}
            {nodePositions['server'] && (
              <div style={{ position: 'absolute', transform: 'translate(-50%, -50%)', zIndex: 20, left: nodePositions['server'].x, top: nodePositions['server'].y }}>
                <div className="relative cursor-pointer">
                  <div style={{ position: 'absolute', inset: -16, background: 'linear-gradient(to right, rgba(96,165,250,0.25), rgba(59,130,246,0.35), rgba(96,165,250,0.25))', filter: 'blur(16px)', borderRadius: '50%' }} />
                  <div className="relative w-14 h-10 flex items-center justify-center">
                    <svg viewBox="0 0 120 70" style={{ width: '100%', height: '100%', filter: 'drop-shadow(0 3px 10px rgba(0, 102, 255, 0.35))' }}>
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
                      <path d="M95 50 C115 50 115 30 95 30 C95 10 70 5 55 18 C40 5 15 10 15 30 C-5 30 -5 50 15 50 Z" fill="url(#cloudGradient)" />
                      <path d="M90 45 C105 45 105 30 90 30 C90 15 70 12 58 22 C48 12 28 15 28 30 C15 30 15 45 28 45 Z" fill="url(#cloudHighlight)" />
                      <g transform="translate(45, 24)">
                        <rect x="2" y="1" width="14" height="5" rx="1" fill="rgba(255,255,255,0.95)" />
                        <rect x="2" y="9" width="14" height="5" rx="1" fill="rgba(255,255,255,0.95)" />
                        <circle cx="6" cy="3.5" r="1.2" fill="#3B82F6" />
                        <circle cx="6" cy="11.5" r="1.2" fill="#3B82F6" />
                      </g>
                    </svg>
                  </div>
                  <div style={{ position: 'absolute', bottom: -16, left: '50%', transform: 'translateX(-50%)', whiteSpace: 'nowrap' }}>
                    <span style={{ fontSize: 8, fontWeight: 700, color: token.colorPrimary, background: token.colorBgContainer, padding: '2px 6px', borderRadius: 10, boxShadow: '0 1px 3px rgba(0,0,0,0.1)', border: `1px solid ${token.colorPrimaryBorder}` }}>{topologyData.server.name}</span>
                  </div>
                </div>
              </div>
            )}

            {/* User Nodes */}
            {topologyData.users.map((user) => {
              const pos = nodePositions[`user_${user.id}`];
              if (!pos) return null;
              const userColor = USER_COLORS[topologyData.users.indexOf(user) % USER_COLORS.length];

              const hoveredDev = visibleDevices.find(d => d.id === hoveredNode);
              const isInAccessPath = hoveredDev ? getAccessibleDevicesWithPaths(hoveredDev.id).pathNodes.has(user.id) : false;
              const shouldDim = hoveredDev && !isInAccessPath;

              return (
                <div key={user.id} style={{ position: 'absolute', transform: 'translate(-50%, -50%)', zIndex: 10, left: pos.x, top: pos.y }}>
                  <div
                    style={{
                      position: 'relative', display: 'flex', alignItems: 'center', gap: 4,
                      padding: '2px 6px', borderRadius: 20, cursor: 'pointer',
                      background: user.online ? token.colorBgContainer : token.colorBgLayout,
                      border: `1px solid ${user.online ? userColor.border : token.colorBorderSecondary}`,
                      boxShadow: isInAccessPath ? `0 0 0 2px #52c41a, 0 4px 12px rgba(82,196,26,0.3)` : '0 1px 3px rgba(0,0,0,0.1)',
                      opacity: shouldDim ? 0.3 : 1,
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={() => setHoveredNode(user.id)}
                    onMouseLeave={() => setHoveredNode(null)}
                  >
                    <div className="relative">
                      <div style={{
                        width: nodeSize.user, height: nodeSize.user, borderRadius: '50%',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#fff', fontWeight: 600, fontSize: nodeSize.user * 0.38,
                        background: user.online ? userColor.gradient : '#999',
                      }}>
                        {user.name.charAt(0).toUpperCase()}
                      </div>
                      <div style={{
                        position: 'absolute', bottom: -2, right: -2, width: 8, height: 8,
                        borderRadius: '50%', border: `2px solid ${token.colorBgContainer}`,
                        background: user.online ? '#52c41a' : '#999',
                      }} />
                    </div>
                    <span style={{ fontSize: 9, fontWeight: 500, color: user.online ? token.colorText : token.colorTextSecondary }}>{user.name}</span>
                    {user.deviceCount > 0 && (
                      <span style={{
                        position: 'absolute', top: -4, right: -4, width: 13, height: 13,
                        background: token.colorPrimary, color: '#fff', borderRadius: '50%',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 7, fontWeight: 700,
                      }}>{user.deviceCount}</span>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Device Nodes */}
            {visibleDevices.map((device) => {
              const pos = nodePositions[device.id];
              if (!pos) return null;
              const isSelected = selectedDevice?.id === device.id;
              const isHovered = hoveredNode === device.id;
              const deviceUserColor = USER_COLORS[topologyData.users.findIndex(u => u.id === device.userId) % USER_COLORS.length];

              const hoveredDev = visibleDevices.find(d => d.id === hoveredNode);
              const isAccessible = hoveredDev && hoveredDev.id !== device.id ? canAccess(hoveredDev.id, device.id) : false;
              const shouldDim = hoveredDev && hoveredDev.id !== device.id && !isAccessible;

              return (
                <div
                  key={device.id}
                  style={{
                    position: 'absolute', transform: 'translate(-50%, -50%)', zIndex: 10,
                    left: pos.x, top: pos.y,
                    opacity: shouldDim ? 0.3 : 1,
                    transition: 'opacity 0.2s',
                  }}
                >
                  <div
                    style={{ position: 'relative', cursor: 'pointer', transform: isSelected ? 'scale(1.15)' : isHovered ? 'scale(1.1)' : 'scale(1)', transition: 'transform 0.2s' }}
                    onClick={(e) => handleDeviceClick(device, e)}
                    onMouseEnter={() => setHoveredNode(device.id)}
                    onMouseLeave={() => setHoveredNode(null)}
                  >
                    {(isSelected || isHovered || isAccessible) && (
                      <div style={{
                        position: 'absolute', inset: 0, borderRadius: '50%', filter: 'blur(8px)',
                        transform: 'scale(1.5)',
                        background: isSelected ? 'rgba(96,165,250,0.4)' : isHovered ? 'rgba(96,165,250,0.3)' : 'rgba(82,196,26,0.35)',
                      }} />
                    )}
                    <div
                      style={{
                        position: 'relative', borderRadius: '50%', display: 'flex', flexDirection: 'column',
                        alignItems: 'center', justifyContent: 'center',
                        width: nodeSize.device, height: nodeSize.device,
                        background: device.online ? token.colorBgContainer : token.colorBgLayout,
                        border: `2px solid ${device.online ? deviceUserColor.border : token.colorBorderSecondary}`,
                        boxShadow: isSelected ? '0 0 0 2px #1677ff, 0 0 0 4px rgba(22,119,255,0.2)' : isHovered ? '0 0 0 2px rgba(96,165,250,0.5), 0 4px 12px rgba(0,0,0,0.15)' : isAccessible ? '0 0 0 2px #52c41a, 0 0 0 4px rgba(82,196,26,0.2)' : '0 1px 3px rgba(0,0,0,0.08)',
                      }}
                    >
                      <DeviceIcon type={device.type} online={device.online} size={nodeSize.icon} />
                      <div style={{
                        position: 'absolute', top: -2, right: -2, width: 9, height: 9,
                        borderRadius: '50%', border: `2px solid ${token.colorBgContainer}`,
                        background: device.online ? '#52c41a' : '#999',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {device.online && <WifiOutlined className="text-5px text-white" />}
                      </div>
                    </div>
                    <div style={{ position: 'absolute', bottom: -28, left: '50%', transform: 'translateX(-50%)', textAlign: 'center', whiteSpace: 'nowrap' }}>
                      <p style={{ fontSize: 8, fontWeight: 500, lineHeight: 1.2, color: device.online ? token.colorText : token.colorTextSecondary }}>
                        {device.name.length > 10 ? device.name.slice(0, 10) + '...' : device.name}
                      </p>
                      <p style={{ fontSize: 7, color: token.colorTextSecondary, fontFamily: 'var(--font-mono)' }}>{device.ip}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Legend */}
        <div style={{ position: 'absolute', bottom: 8, left: 8, background: token.colorBgElevated, borderRadius: 8, padding: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.1)', border: `1px solid ${token.colorBorderSecondary}`, zIndex: 30 }}>
          <p style={{ fontSize: 8, fontWeight: 600, color: token.colorTextSecondary, marginBottom: 4 }}>{t.topology.legend}</p>
          <div className="flex flex-col gap-0.5" style={{fontSize: 12, fontWeight: 500}}>
            <div className="flex items-center gap-1"><div style={{ width: 8, height: 8, borderRadius: '50%', background: '#52c41a', marginRight: 8 }} /><span style={{ color: token.colorTextSecondary }}>{t.common.status.online}</span></div>
            <div className="flex items-center gap-1"><div style={{ width: 8, height: 8, borderRadius: '50%', background: '#999', marginRight: 8 }} /><span style={{ color: token.colorTextSecondary }}>{t.common.status.offline}</span></div>
            <div className="flex items-center gap-1"><div style={{ width: 16, height: 2, background: '#52c41a', borderRadius: 2 }} /><span style={{ color: token.colorTextSecondary }}>{t.topology.accessiblePath}</span></div>
          </div>
          {topologyData.users.length > 0 && (
            <div style={{ marginTop: 6, paddingTop: 4, borderTop: `1px solid ${token.colorBorderSecondary}` }}>
              <p style={{ fontSize: 7, color: token.colorTextSecondary, marginBottom: 2 }}>{t.topology.userColors}</p>
              <div className="flex flex-wrap gap-1">
                {topologyData.users.slice(0, 6).map((user, idx) => {
                  const color = USER_COLORS[idx % USER_COLORS.length];
                  return (
                    <div key={user.id} className="flex items-center gap-0.5">
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: color.gradient }} />
                      <span style={{ fontSize: 7, color: token.colorTextSecondary }}>{user.name.slice(0, 3)}</span>
                    </div>
                  );
                })}
                {topologyData.users.length > 6 && <span style={{ fontSize: 7, color: token.colorTextSecondary }}>+{topologyData.users.length - 6}</span>}
              </div>
            </div>
          )}
        </div>

        {/* Stats */}
        <div style={{ position: 'absolute', bottom: 8, right: 8, background: token.colorBgElevated, borderRadius: 8, padding: '4px 8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', border: `1px solid ${token.colorBorderSecondary}`, zIndex: 30 }}>
          <p style={{ fontSize: 12, fontWeight: 500, color: token.colorTextSecondary, margin: 0 }}>
            {topologyData.users.length} {t.topology.usersLabel} · {visibleDevices.length}/{topologyData.devices.length} {t.topology.devicesLabel} · {visibleDevices.filter(d => d.online).length} {t.common.status.online}
            {hideOfflineDevices && <span className="text-#faad14 ml-1">({t.topology.onlineOnly})</span>}
          </p>
        </div>

        {/* Instructions */}
        <div style={{ position: 'absolute', top: 8, right: 8, background: token.colorBgElevated, borderRadius: 8, padding: '4px 8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', border: `1px solid ${token.colorBorderSecondary}`, zIndex: 30 }}>
          <p style={{ fontSize: 12, fontWeight: 500, color: token.colorTextSecondary, display: 'flex', alignItems: 'center', gap: 4, margin: 0 }}><DragOutlined className="text-4" /> {t.topology.instructions}</p>
        </div>
      </div>

      {/* Device Detail Drawer */}
      <Drawer
        open={!!selectedDevice}
        onClose={() => setSelectedDevice(null)}
        title={
          selectedDevice ? (
            <div className="flex items-center gap-3">
              <div style={{
                width: 40, height: 40, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: selectedDevice.online ? token.colorPrimaryBg : token.colorBgLayout,
                border: `1px solid ${selectedDevice.online ? token.colorPrimaryBorder : token.colorBorderSecondary}`,
              }}>
                <DeviceIcon type={selectedDevice.type} online={selectedDevice.online} size={22} />
              </div>
              <div>
                <div className="text-16px font-600">{selectedDevice.name}</div>
                <Text type="secondary" className="mono-cell">{selectedDevice.ip}</Text>
              </div>
            </div>
          ) : null
        }
        width={400}
      >
        {selectedDevice && (
          <div className="flex flex-col gap-4">
            <div className="flex justify-between items-center">
              <Text type="secondary">{t.topology.status}</Text>
              <Tag color={selectedDevice.online ? 'success' : 'default'}>{selectedDevice.online ? t.common.status.online : t.common.status.offline}</Tag>
            </div>
            <div className="flex justify-between items-center">
              <Text type="secondary">{t.topology.belongsToUser}</Text>
              <Text strong>{selectedDevice.userName || selectedDevice.userId}</Text>
            </div>
            {selectedDevice.lastSeen && (
              <div className="flex justify-between items-center">
                <Text type="secondary">{t.topology.lastOnline}</Text>
                <Text>{new Date(selectedDevice.lastSeen).toLocaleString('zh-CN')}</Text>
              </div>
            )}

            <div style={{ height: 1, background: token.colorBorderSecondary }} />

            <div>
              <div className="flex items-center gap-2 mb-2">
                <Text strong>{t.topology.aclPermissions}</Text>
                <Tag>{getDeviceACL(selectedDevice.id).allowed.length} {t.topology.allow} / {getDeviceACL(selectedDevice.id).denied.length} {t.topology.deny}</Tag>
              </div>
              <div className="max-h-60 overflow-auto pr-1">
                <div className="flex flex-col gap-3">
                  {Object.entries(getACLSortedDevices()).map(([userName, devices]) => (
                    <div key={userName}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6, fontSize: 12, color: token.colorTextSecondary }}>
                        <span style={{ width: 16, height: 16, borderRadius: '50%', background: token.colorPrimaryBg, color: token.colorPrimary, fontSize: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600 }}>{userName.charAt(0).toUpperCase()}</span>
                        {userName}
                        <span style={{ fontSize: 9, color: token.colorTextQuaternary }}>({devices.length})</span>
                      </div>
                      <div className="flex flex-col gap-1 ml-2">
                        {devices.map(({ device, canAccessTo }) => (
                          <div key={device.id} style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: 6, borderRadius: 8,
                            background: canAccessTo ? 'rgba(82,196,26,0.06)' : 'rgba(255,77,79,0.06)',
                            border: `1px solid ${canAccessTo ? 'rgba(82,196,26,0.2)' : 'rgba(255,77,79,0.2)'}`,
                          }}>
                            <div className="flex items-center gap-1.5">
                              <div style={{ width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: device.online ? token.colorBgContainer : token.colorBgLayout }}>
                                <DeviceIcon type={device.type} online={device.online} size={13} />
                              </div>
                              <div>
                                <div className="text-10px font-500">{device.name}</div>
                                <div style={{ fontSize: 9, color: token.colorTextSecondary, fontFamily: 'var(--font-mono)' }}>{device.ip}</div>
                              </div>
                            </div>
                            <Tag color={canAccessTo ? 'success' : 'error'} className="text-9px m-0 px-1">{canAccessTo ? t.topology.allow : t.topology.deny}</Tag>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ height: 1, background: token.colorBorderSecondary }} />

            <div>
              <Text strong className="block mb-1.5">{t.topology.quickActions}</Text>
              <div className="flex flex-col gap-1.5">
                <Button block size="small" icon={<CodeOutlined />} onClick={() => copyToClipboard(`ssh root@${selectedDevice.ip}`)}>
                  {t.topology.copySSH}
                </Button>
                <Button block size="small" icon={<CopyOutlined />} onClick={() => copyToClipboard(selectedDevice.ip)}>
                  {t.topology.copyIP}
                </Button>
              </div>
            </div>
          </div>
        )}
      </Drawer>
    </Card>
  );
}
