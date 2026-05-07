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

import { ClockCircleOutlined, CloudServerOutlined, DashboardOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import { useRequest } from 'ahooks';
import { Card, Empty, message, Segmented, Skeleton, Space, Tag, theme, Typography } from 'antd';
import { useMemo, useState } from 'react';
import { metricsApi } from '@/api';
import DashboardLayout from '@/components/DashboardLayout';
import PageHeaderStatCards from '@/components/PageHeaderStatCards';
import { useTranslation } from '@/i18n/index';

const { Title, Text } = Typography;

type SummaryRangeKey = 'today' | 'week' | 'month' | 'history';

interface DurationSummary {
  totalHours: number;
  avgHours: number;
  deviceCount: number;
  onlineRate: number;
}

interface DeviceMetricsStatus {
  machineId: string;
  machineName: string;
  userName: string;
  online: boolean;
  ipAddress: string;
  lastSeen: string | null;
}

interface DeviceHistoryPoint {
  time: string;
  status: string;
}

interface TimelineRow extends DeviceMetricsStatus {
  segments: boolean[];
  onlineRatio: number;
}

interface RangeWindow {
  start?: Date;
  end: Date;
}

const TIMELINE_SEGMENTS = 56;

function formatDate(date: Date) {
  return date.toISOString().split('T')[0];
}

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function buildRangeWindow(key: SummaryRangeKey): RangeWindow {
  const end = new Date();
  const start = new Date(end);

  if (key === 'today') {
    return { start: startOfToday(), end };
  }
  if (key === 'week') {
    start.setDate(end.getDate() - 7);
    return { start, end };
  }
  if (key === 'month') {
    start.setDate(end.getDate() - 30);
    return { start, end };
  }
  return { end };
}

function normalizeDurationSummary(records: any[]): DurationSummary {
  const totalHours = records.reduce((sum, record) => sum + Number(record?.online_hours || 0), 0);
  const deviceCount = records.length;
  const activeDeviceCount = records.filter((record) => Number(record?.online_hours || 0) > 0).length;
  return {
    totalHours,
    avgHours: deviceCount > 0 ? totalHours / deviceCount : 0,
    deviceCount,
    onlineRate: deviceCount > 0 ? (activeDeviceCount / deviceCount) * 100 : 0,
  };
}

function normalizeDeviceStatus(records: any[]): DeviceMetricsStatus[] {
  return records.map((record) => ({
    machineId: String(record?.machine_id || ''),
    machineName: String(record?.machine_name || record?.name || '-'),
    userName: String(record?.user_name || ''),
    online: Boolean(record?.online),
    ipAddress: String(record?.ip_address || ''),
    lastSeen: typeof record?.last_seen === 'string' ? record.last_seen : null,
  }));
}

function normalizeHistory(records: any[]): DeviceHistoryPoint[] {
  return records
    .map((record) => ({
      time: typeof record?.time === 'string' ? record.time : '',
      status: String(record?.status || ''),
    }))
    .filter((record) => record.time)
    .sort((left, right) => new Date(left.time).getTime() - new Date(right.time).getTime());
}

function buildTimelineSegments(history: DeviceHistoryPoint[], start: Date, end: Date, segmentsCount = TIMELINE_SEGMENTS) {
  const segments = Array.from({ length: segmentsCount }, () => false);
  const rangeMs = Math.max(end.getTime() - start.getTime(), 1);
  const bucketMs = rangeMs / segmentsCount;
  let historyIndex = 0;
  let currentOnline = false;

  for (let segmentIndex = 0; segmentIndex < segmentsCount; segmentIndex += 1) {
    const bucketEnd = start.getTime() + bucketMs * (segmentIndex + 1);
    while (historyIndex < history.length && new Date(history[historyIndex].time).getTime() <= bucketEnd) {
      currentOnline = history[historyIndex].status === 'online';
      historyIndex += 1;
    }
    segments[segmentIndex] = currentOnline;
  }

  return segments;
}

function formatHours(hours: number) {
  if (hours >= 24) {
    return `${(hours / 24).toFixed(1)}d`;
  }
  return `${hours.toFixed(1)}h`;
}

function formatRate(rate: number) {
  const bounded = Math.max(0, Math.min(100, rate));
  return `${bounded.toFixed(1)}%`;
}

function parseIPv4ToNumber(ipAddress: string): number | null {
  const parts = ipAddress.trim().split('.');
  if (parts.length !== 4) {
    return null;
  }

  const octets = parts.map((part) => Number(part));
  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return null;
  }

  return ((octets[0] * 256 + octets[1]) * 256 + octets[2]) * 256 + octets[3];
}

function compareIPAddress(leftIP: string, rightIP: string) {
  const leftV4 = parseIPv4ToNumber(leftIP);
  const rightV4 = parseIPv4ToNumber(rightIP);

  if (leftV4 !== null && rightV4 !== null) {
    return leftV4 - rightV4;
  }
  if (leftV4 !== null) {
    return -1;
  }
  if (rightV4 !== null) {
    return 1;
  }

  const left = leftIP.trim();
  const right = rightIP.trim();
  if (!left && !right) {
    return 0;
  }
  if (!left) {
    return 1;
  }
  if (!right) {
    return -1;
  }
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' });
}

export default function Metrics() {
  const t = useTranslation();
  const { token: themeToken } = theme.useToken();
  const [timelineRange, setTimelineRange] = useState<SummaryRangeKey>('today');

  const { data: metricsData, loading } = useRequest(
    async () => {
      try {
        const influxStatus: any = await metricsApi.getInfluxDBStatus().catch(() => ({ connected: false }));
        const influxConnected = !!influxStatus?.connected;

        const selectedRangeWindow = buildRangeWindow(timelineRange);

        const [summaryRaw, deviceStatusRaw] = await Promise.all([
          metricsApi.getOnlineDurationSummary({
            end: formatDate(selectedRangeWindow.end),
          }).then((response: any) => response || {}).catch(() => ({})),
          metricsApi.getDeviceStatus().then((response: any) => Array.isArray(response) ? response : response?.data || []).catch(() => []),
        ]);

        const summaryData: any = summaryRaw || {};

        const summaryByRange: Record<SummaryRangeKey, DurationSummary> = {
          today: {
            totalHours: Number(summaryData?.today?.total_hours || 0),
            avgHours: Number(summaryData?.today?.avg_hours || 0),
            deviceCount: Number(summaryData?.today?.device_count || 0),
            onlineRate: Number(summaryData?.today?.online_rate || 0),
          },
          week: {
            totalHours: Number(summaryData?.week?.total_hours || 0),
            avgHours: Number(summaryData?.week?.avg_hours || 0),
            deviceCount: Number(summaryData?.week?.device_count || 0),
            onlineRate: Number(summaryData?.week?.online_rate || 0),
          },
          month: {
            totalHours: Number(summaryData?.month?.total_hours || 0),
            avgHours: Number(summaryData?.month?.avg_hours || 0),
            deviceCount: Number(summaryData?.month?.device_count || 0),
            onlineRate: Number(summaryData?.month?.online_rate || 0),
          },
          history: {
            totalHours: Number(summaryData?.history?.total_hours || 0),
            avgHours: Number(summaryData?.history?.avg_hours || 0),
            deviceCount: Number(summaryData?.history?.device_count || 0),
            onlineRate: Number(summaryData?.history?.online_rate || 0),
          },
        };

        const deviceStatus = normalizeDeviceStatus(deviceStatusRaw).sort((left, right) => {
          if (left.online !== right.online) {
            return left.online ? -1 : 1;
          }

          const ipCompare = compareIPAddress(left.ipAddress, right.ipAddress);
          if (ipCompare !== 0) {
            return ipCompare;
          }

          return left.machineName.localeCompare(right.machineName);
        });

        const selectedRangeStart = selectedRangeWindow.start;
        const histories = new Map<string, DeviceHistoryPoint[]>();
        const machineIDs = deviceStatus.map((device) => device.machineId).filter(Boolean);
        if (machineIDs.length > 0) {
          const historyResponse: any = await metricsApi.getDeviceStatusHistories({
            machine_ids: machineIDs,
            start: selectedRangeStart ? formatDate(selectedRangeStart) : undefined,
            end: formatDate(selectedRangeWindow.end),
          }).catch(() => ({}));

          const historyMap = historyResponse && !Array.isArray(historyResponse)
            ? (historyResponse?.data || historyResponse)
            : {};

          machineIDs.forEach((machineID) => {
            histories.set(machineID, normalizeHistory(historyMap?.[machineID] || []));
          });
        }

        let timelineStart = selectedRangeStart;
        if (!timelineStart) {
          let earliestTimestamp = Number.POSITIVE_INFINITY;
          histories.forEach((points) => {
            for (const point of points) {
              const ts = new Date(point.time).getTime();
              if (Number.isFinite(ts) && ts < earliestTimestamp) {
                earliestTimestamp = ts;
              }
            }
          });

          if (Number.isFinite(earliestTimestamp)) {
            timelineStart = new Date(earliestTimestamp);
          } else {
            timelineStart = startOfToday();
          }
        }

        const timelineRows = deviceStatus.map((device) => {
          const segments = buildTimelineSegments(histories.get(device.machineId) || [], timelineStart, selectedRangeWindow.end);
          const onlineRatio = segments.filter(Boolean).length / Math.max(segments.length, 1);
          return {
            ...device,
            segments,
            onlineRatio,
          } satisfies TimelineRow;
        });

        const onlineCount = deviceStatus.filter((device) => device.online).length;

        return {
          influxConnected,
          summaryByRange,
          timelineRows,
          totalOnline: onlineCount,
          totalDevices: deviceStatus.length,
          selectedRangeWindow,
        };
      } catch (error) {
        console.error(error);
        message.error(t.metrics.loadFailed);
        throw error;
      }
    },
    {
      refreshDeps: [timelineRange],
      onError: () => {
        // Error already handled
      },
    },
  );

  const summaryByRange = metricsData?.summaryByRange;
  const timelineRows: TimelineRow[] = metricsData?.timelineRows || [];
  const totalOnline = metricsData?.totalOnline || 0;
  const totalDevices = metricsData?.totalDevices || 0;
  const influxConnected = metricsData?.influxConnected ?? null;

  const summaryCards = useMemo(() => {
    const fallback: DurationSummary = { totalHours: 0, avgHours: 0, deviceCount: 0, onlineRate: 0 };
    const today = summaryByRange?.today || fallback;
    const week = summaryByRange?.week || fallback;
    const month = summaryByRange?.month || fallback;
    const history = summaryByRange?.history || fallback;

    return [
      {
        label: t.metrics.todayDuration,
        value: formatRate(today.onlineRate),
        subText: t.metrics.avgDurationPerDevice.replace('{value}', formatHours(today.avgHours)),
        icon: <ClockCircleOutlined style={{ fontSize: 28, color: themeToken.colorPrimary }} />,
        watermark: 'DAY',
      },
      {
        label: t.metrics.weekDuration,
        value: formatRate(week.onlineRate),
        subText: t.metrics.avgDurationPerDevice.replace('{value}', formatHours(week.avgHours)),
        icon: <ClockCircleOutlined style={{ fontSize: 28, color: themeToken.colorSuccess }} />,
        watermark: '7D',
      },
      {
        label: t.metrics.monthDuration,
        value: formatRate(month.onlineRate),
        subText: t.metrics.avgDurationPerDevice.replace('{value}', formatHours(month.avgHours)),
        icon: <ClockCircleOutlined style={{ fontSize: 28, color: themeToken.colorWarning }} />,
        watermark: '30D',
      },
      {
        label: t.metrics.historyDuration,
        value: formatRate(history.onlineRate),
        subText: t.metrics.avgDurationPerDevice.replace('{value}', formatHours(history.avgHours)),
        icon: <ClockCircleOutlined style={{ fontSize: 28, color: themeToken.colorInfo }} />,
        watermark: 'ALL',
      },
      {
        label: t.metrics.onlineDevices,
        value: totalOnline,
        subText: t.metrics.totalDevicesSuffix.replace('{total}', String(totalDevices)),
        icon: <DashboardOutlined className="stat-icon-success" />,
        watermark: 'ON',
      },
      {
        label: t.metrics.dataStatus,
        value: loading ? t.metrics.updating : influxConnected === false ? t.metrics.notConnected : t.metrics.updated,
        valueColor: loading ? undefined : influxConnected === false ? themeToken.colorWarning : undefined,
        icon: <CloudServerOutlined className="stat-icon-primary" />,
        watermark: 'DB',
      },
    ];
  }, [influxConnected, loading, summaryByRange, t, themeToken.colorInfo, themeToken.colorPrimary, themeToken.colorSuccess, themeToken.colorWarning, totalDevices, totalOnline]);

  const timelineRangeLabel = useMemo(() => {
    if (timelineRange === 'today')
      return t.metrics.rangeStartToday;
    if (timelineRange === 'week')
      return t.metrics.rangeStartWeek;
    if (timelineRange === 'month')
      return t.metrics.rangeStartMonth;
    return t.metrics.rangeStartHistory;
  }, [t, timelineRange]);

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        <div className="page-header-row">
          <div>
            <Title level={4} className="m-0">{t.metrics.title}</Title>
            <Text type="secondary">{t.metrics.description}</Text>
          </div>
          <Segmented
            value={timelineRange}
            onChange={(value) => setTimelineRange(value as SummaryRangeKey)}
            data-tour-id="metrics-range"
            options={[
              { value: 'today', label: t.metrics.today },
              { value: 'week', label: t.metrics.last7Days },
              { value: 'month', label: t.metrics.last30Days },
              { value: 'history', label: t.metrics.history },
            ]}
          />
        </div>

        <PageHeaderStatCards
          minCardWidth={260}
          gap={16}
          items={summaryCards}
        />

        <Card
          title={t.metrics.deviceStatusTimeline}
          extra={<Text type="secondary">{t.metrics.timelineRangeHint.replace('{range}', timelineRangeLabel)}</Text>}
          data-tour-id="metrics-charts"
        >
          {loading
            ? (
                <Space direction="vertical" className="w-full" size={16}>
                  {Array.from({ length: 4 }).map((_, index) => (
                    <Skeleton.Input key={index} active block style={{ height: 74 }} />
                  ))}
                </Space>
              )
            : timelineRows.length === 0
              ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t.metrics.noDeviceData} />
                )
              : (
                  <Space direction="vertical" className="w-full" size={14}>
                    {timelineRows.map((device) => (
                      <div
                        key={device.machineId}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'minmax(220px, 280px) minmax(0, 1fr)',
                          gap: 18,
                          alignItems: 'center',
                          borderRadius: themeToken.borderRadiusLG,
                          border: `1px solid ${themeToken.colorBorderSecondary}`,
                          background: themeToken.colorBgContainer,
                          padding: '16px 18px',
                        }}
                      >
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <Tag color={device.onlineRatio >= 1 ? 'success' : device.onlineRatio > 0 ? 'processing' : 'default'} className="m-0 px-3 py-0.5 rounded-full">
                              {`${Math.round(device.onlineRatio * 100)}%`}
                            </Tag>
                            <Text strong>{device.machineName}</Text>
                            {device.online
                              ? <Tag color="success" className="m-0">{t.common.status.online}</Tag>
                              : <Tag className="m-0">{t.common.status.offline}</Tag>}
                          </div>
                          <div className="mt-2 flex items-center gap-2 flex-wrap">
                            {device.userName && <Text type="secondary">{device.userName}</Text>}
                            {device.ipAddress && <Text type="secondary" className="font-mono">{device.ipAddress}</Text>}
                            {device.lastSeen && <Text type="secondary">{new Date(device.lastSeen).toLocaleString()}</Text>}
                          </div>
                        </div>

                        <div>
                          <div
                            style={{
                              display: 'grid',
                              gridTemplateColumns: `repeat(${TIMELINE_SEGMENTS}, minmax(0, 1fr))`,
                              gap: 4,
                              alignItems: 'end',
                            }}
                          >
                            {device.segments.map((segment, index) => (
                              <span
                                key={`${device.machineId}-${index}`}
                                style={{
                                  display: 'block',
                                  height: 28,
                                  borderRadius: 999,
                                  background: segment ? '#58d68d' : themeToken.colorFillTertiary,
                                  opacity: segment ? 1 : 0.65,
                                }}
                              />
                            ))}
                          </div>
                          <div className="flex items-center justify-between mt-2">
                            <Text type="secondary">{timelineRangeLabel}</Text>
                            <Text type="secondary">{t.metrics.nowLabel}</Text>
                          </div>
                        </div>
                      </div>
                    ))}
                  </Space>
                )}
        </Card>

        {!loading && influxConnected === false && (
          <Card>
            <div className="flex items-center gap-2" style={{ color: themeToken.colorWarning }}>
              <ExclamationCircleOutlined />
              <Text style={{ color: themeToken.colorWarning }}>{t.metrics.influxWarning}</Text>
            </div>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
